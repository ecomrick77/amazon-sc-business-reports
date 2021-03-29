const puppeteer = require('puppeteer'),
    axios = require('axios').default,
    jsdom = require("jsdom"),
    { JSDOM } = jsdom,
    sleep = require('sleep'),
    asyncForEach = require('async-await-foreach'),
    _ = require('lodash'),
    { format } = require('fecha'),
    randomInt = require('random-int'),
    CaptchaClient = require('@infosimples/node_two_captcha'),
    fsc = require('fs'),
    fs = require('fs/promises'),
    path = require('path'),
    merge = require('deepmerge'),
    inarray = require('inarray'),
    uuid = require('uuid'),
    csv=require('csvtojson'),
    { Readable } = require('stream'),
    outputStream = new Readable({
        read() {}, objectMode: true
    })

class SellerCentralBusinessReports{
    #Accounts=[]
    #AccountSelected={}
    #AccountsProcessed = []
    #Browser;
    #Options;
    #Page;
    #ReportDates=[]
    #ReportsUrl='https://sellercentral.amazon.com/gp/site-metrics/report.html#&reportID=eD0RCS'
    #Settings;
    #TwilioRetries=0;
    #UniqueId;

    async #startPuppeteer(){
        this.#Browser = await puppeteer.launch({
            headless: true,
            defaultViewport: null,
            args: [`--window-size=1600,900`]
        });
        this.#Page = await this.#Browser.newPage();
        await this.#Page.exposeFunction('JSDOM', JSDOM);
        await this.#Page.setDefaultTimeout(90000) // 90 seconds (3x default)
        await this.#Page.setDefaultNavigationTimeout(90000)
        await this.#Page.exposeFunction("format", format);
    }

    /**
     * One-Time Password Resolution Settings
     * @typedef {Object} otpSettings
     * @property {string} TWILIO_ACCOUNT_SID - Twilio account sid
     * @property {string} TWILIO_AUTH_TOKEN - Twilio account auth token
     */

    /**
     * Captcha Resolution Settings
     * @typedef {Object} captchaSettings
     * @property {string} TWOCAPTCHA_API_KEY - 2captcha api key
     */

    /**
     * The settings object.
     * @typedef {Object} settingsObject
     * @property {string} loginEmail - seller central login email address or phone number
     * @property {string} loginPass - seller central login password
     * @property {otpSettings} otp - One-Time Password retrieval credentials
     * @property {captchaSettings} captcha - Captcha resolution credentials
     */

    /**
     * Download Business Reports from Amazon Seller Central
     * @param {settingsObject} settings - The Settings Object
     * @param {array[]} dates - Array of Date Ranges for Reports
     * @param {object} options - The Options Settings Object
     * @return {Promise<module:stream.internal.Readable|false>}
     */
    async getReports(settings, dates, options = {}){
        try{
            this.#UniqueId = uuid.v4()
            const defaultSettings = {
                loginEmail: '', // seller central login email address or phone number
                loginPass: '', // seller central login password
                otp: {
                    TWILIO_ACCOUNT_SID: '', // twilio account sid for OTP resolution
                    TWILIO_AUTH_TOKEN: '' // twilio account auth token
                },
                captcha: {
                    TWOCAPTCHA_API_KEY: '' // 2captcha api key for captcha resolution
                }
            }
            this.#Settings = merge(defaultSettings, settings)
            this.#ReportDates=dates
            const defaultOptions = {
                reports: {
                    SalesTraffic: true,
                    DetailSalesTraffic: true,
                    SellerPerformance: true,
                    DetailSalesTrafficBySKU: true,
                    DetailSalesTrafficByParent: true,
                    DetailSalesTrafficByChild: true,
                    BrandPerformance: true
                },
                exclude: {
                    merchantIds: [],
                    marketplaceIds: []
                }
            }
            this.#Options=merge(defaultOptions,options)
            await this.#startPuppeteer()
            // open reports dashboard
            await this.#Page.goto(this.#ReportsUrl, {
                waitUntil: 'networkidle0',
            });
            return await this.#router()
        } catch (err) {
            console.log('ERROR:', err)
        }
    }

    async #router(){
        const pageTitle = await this.#Page.title()
        if(pageTitle === 'Amazon Sign-In'){
            return await this.#login()
        } else if(pageTitle === 'Two-Step Verification'){
            return await this.#loginOTP()
        } else if(pageTitle === ''){
            console.error('Password Reset Required')
            return false;
        } else{
            return await this.#getReports()
        }
    }

    async #login(){
        // clear login email
        await this.#Page.evaluate(()=> document.querySelector('#ap_email').value='')
        // enter login email
        await this.#Page.click('#ap_email');
        await this.#Page.keyboard.type(this.#Settings.loginEmail, {
            delay: randomInt(100, 400),
        });
        // enter login password
        await this.#Page.click('#ap_password');
        await this.#Page.keyboard.type(this.#Settings.loginPass, {
            delay: randomInt(100, 400),
        });

        const captchaImg = await this.#Page.evaluate(()=> document.querySelector('#auth-captcha-image')?.getAttribute('src'))
        let resolvedCaptcha=false
        if(captchaImg){
            const captcha = await this.#getCaptchaResolved(captchaImg)
            console.log('Captcha:', captcha)
            await this.#Page.click('#auth-captcha-guess')
            await this.#Page.keyboard.type(captcha, {
                delay: randomInt(100, 400),
            })
            resolvedCaptcha=true
        }

        if(!captchaImg || resolvedCaptcha === true){
            // click submit
            await this.#Page.click('#signInSubmit')
            await this.#Page.waitForTimeout(5000)
            return await this.#router()
        }
    }

    async #loginOTP(){
        if(await this.#Page.evaluate(() => document.querySelector('#auth-send-code'))) {
            // OTP number selection
            if(await this.#Page.evaluate(() =>
                document.querySelector('#auth-error-message-box div.a-alert-container h4.a-alert-heading'))){
                // OTP wont send any more codes
                console.error('ERROR: SMS Limit Exceeded for today')
                return false;
            }
            await this.#Page.waitForTimeout(randomInt(900, 1800))
            // TODO: select a number from list (last 3 digits)
            // click submit
            await this.#Page.click('#auth-send-code')
            await this.#Page.waitForTimeout(5000)
            return this.#router()
        }

        // enter OTP code
        await this.#Page.click('#auth-mfa-otpcode')
        await this.#Page.keyboard.type(await this.#getOtpResolved(), {
            delay: randomInt(100, 400),
        });
        await this.#Page.waitForTimeout(randomInt(900, 1800))
        // click submit
        await this.#Page.click('#auth-signin-button')
        await this.#Page.waitForTimeout(5000)
        return await this.#router()
    }

    /**
     * Resolve a OTP with Twilio
     * @return {string} The resolved OTP code
     */
    async #getOtpResolved(){
        // await sms message
        await sleep.msleep(5000)
        // connect to twilio
        const msgs = await axios.get(`https://api.twilio.com/2010-04-01/Accounts/${this.#Settings.otp.TWILIO_ACCOUNT_SID}/Messages/.json?PageSize=3&Page=0`,{
            auth: { username: this.#Settings.otp.TWILIO_ACCOUNT_SID, password: this.#Settings.otp.TWILIO_AUTH_TOKEN }
        }).catch(async err=>{
            console.log('Twilio Error: ', err)
            this.#TwilioRetries++;
        })

        if(msgs.data){
            const messages = msgs.data.messages
            // find message containing OTP
            const msg = messages.find(m => {
                return m.body.search(' OTP.') > 0;
            })
            const code = msg.body !== undefined ? msg.body.split(' ')[0]: ''
            if(code) {
                // return code
                console.log('OTP-CODE:', code)
                return code;
            }
            // retry
            sleep.msleep(10000)
            return this.#getOtpResolved();
        }

        await sleep.msleep(10000)
        if(this.#TwilioRetries <= 3) {
            return this.#getOtpResolved()
        }
    }

    /**
     * Resolve a Captcha Image with 2captcha
     * @param {string} imgUrl - The image URL to resolve
     * @return {string} The resolved captcha string
     */
    async #getCaptchaResolved(imgUrl){
        // connect to 2captcha
        const client = new CaptchaClient(this.#Settings.captcha.TWOCAPTCHA_API_KEY, {
            timeout: 60000,
            polling: 5000,
            throwErrors: false
        });
        // send captcha image
        const response = await client.decode({
            url: imgUrl
        })
        return response.text
    }

    async #getReports(){
        await this.#setAccounts()
        let storageDir = path.resolve('./.business-reports')
        await fs.access(storageDir).catch(async ()=>{
            await fs.mkdir(storageDir)
        });
        let uniqueDir = path.resolve(storageDir+'/'+this.#UniqueId)
        await fs.access(uniqueDir).catch(async ()=>{
            await fs.mkdir(uniqueDir)
        });
        await asyncForEach(this.#Accounts.filter(a => a.excluded === false)
            .filter(a => {
                return !(a.merchant === this.#AccountSelected.partner && inarray(this.#Options.exclude.merchantIds, this.#AccountSelected.merchant));
            }),async a => {
            // merchant
            await asyncForEach(a.markets.filter(m => m.excluded === false), async m => {
                // marketplace
                if(m.selected === false) {
                    // change merchant+marketplace
                    await this.#setAccountChange(a.merchant, m.marketplace)
                }

                // true merchantId only available when selected
                let merchantDir = path.resolve(uniqueDir+'/'+this.#AccountSelected.merchant)
                await fs.access(merchantDir).catch(async ()=>{
                    await fs.mkdir(merchantDir)
                });
                let marketplaceDir = path.resolve(merchantDir+'/'+m.marketplace)
                await fs.access(marketplaceDir).catch(async ()=>{
                    await fs.mkdir(marketplaceDir);
                })

                console.log('getReports:', {
                    account: a.name,
                    merchant: this.#AccountSelected.merchant,
                    marketplace: m.marketplace
                })

                // Amazon Seller Central Business Reports
                // SalesTraffic
                if(this.#Options.reports.SalesTraffic === true) {
                    await this.#getReport('SalesTrafficTimeSeries', a.merchant, m.marketplace, marketplaceDir)
                }
                // DetailSalesTraffic
                if(this.#Options.reports.DetailSalesTraffic === true) {
                    await this.#getReport('DetailSalesTrafficByTime', a.merchant, m.marketplace, marketplaceDir)
                }
                // SellerPerformance
                if(this.#Options.reports.SellerPerformance === true) {
                    await this.#getReport('SellerPerformanceForMerchants', a.merchant, m.marketplace, marketplaceDir)
                }
                // DetailSalesTrafficBySKU
                if(this.#Options.reports.DetailSalesTrafficBySKU === true) {
                    await this.#getReport('DetailSalesTrafficBySKU', a.merchant, m.marketplace, marketplaceDir)
                }
                // DetailSalesTrafficByParent
                if(this.#Options.reports.DetailSalesTrafficByParent === true) {
                    await this.#getReport('DetailSalesTrafficByParentItem', a.merchant, m.marketplace, marketplaceDir)
                }
                // DetailSalesTrafficByChild
                if(this.#Options.reports.DetailSalesTrafficByChild === true) {
                    await this.#getReport('DetailSalesTrafficByChildItem', a.merchant, m.marketplace, marketplaceDir)
                }
                // BrandPerformance
                if(this.#Options.reports.BrandPerformance === true) {
                    const hasBrandPerformance = await this.#Page.evaluate(() => document.querySelector('#report_BrandPerformannce'))
                    if (hasBrandPerformance) {
                        await this.#getReport('BrandPerformannce', a.merchant, m.marketplace, marketplaceDir)
                    }
                }

                // merchant+marketplace pair complete
                await this.#setAccountProcessed(a.merchant,m.marketplace)
            })
        })

        const shortNames = {
            SalesTrafficTimeSeries: 'SalesTraffic',
            DetailSalesTrafficByTime: 'DetailSalesTraffic',
            SellerPerformanceForMerchants: 'SellerPerformance',
            DetailSalesTrafficBySKU: 'DetailSalesTrafficBySKU',
            DetailSalesTrafficByParentItem: 'DetailSalesTrafficByParent',
            DetailSalesTrafficByChildItem: 'DetailSalesTrafficByChild',
            BrandPerformannce: 'BrandPerformance'
        }
        const csvFiles = await this.#getDownloads(path.resolve('./.business-reports/'+this.#UniqueId))
        asyncForEach(csvFiles, async csvFile => {
            let jsonResults = await csv({checkType: true}).fromFile(csvFile)
            let vars = csvFile.split(this.#UniqueId+'/')[1].split('/')
            let dates = vars[3].split('_')
            outputStream.push({
                merchant: vars[0],
                marketplace: vars[1],
                report: shortNames[vars[2]],
                reportId: vars[2],
                period: {
                    from: dates[0],
                    to: dates[1],
                },
                rows: jsonResults.map(fields => {
                    let remap={}
                    _.forEach(fields, (v,i)=>{
                        remap[_.camelCase(i)]=v
                    })
                    return remap
                })
            })
        }).then(()=>{
            outputStream.push(null)
        })
        return outputStream
    }

    /**
     * Download report for ReportDates
     * @param {string} reportName - The report identifier
     * @param {string} merchant - The seller ID
     * @param {string} marketplace - The marketplace ID
     * @param {string} marketplaceDir - The marketplace base download path
     * @return void
     */
    async #getReport(reportName, merchant, marketplace, marketplaceDir){
        let reportDir = path.resolve(marketplaceDir+'/'+reportName)
        await fs.access(reportDir).catch(async ()=>{
            await fs.mkdir(reportDir)
        })
        await this.#Page.waitForSelector('a#report_'+reportName)
        await this.#Page.click('a#report_'+reportName)
        await this.#Page.waitForSelector('table#dataTable', {visible: true})
        await asyncForEach(this.#ReportDates.map(d => {
            return {
                start: d[0],
                end: d[1]
            }
        }), async rDate => {
            let downloadDir = path.resolve(reportDir+'/' +format(new Date(rDate.start),'YYYY-MM-DD')
                +'_'+format(new Date(rDate.end),'YYYY-MM-DD'))
            await fs.access(downloadDir).catch(async ()=>{
                await fs.mkdir(downloadDir)
            })
            // set download path
            // solution to https://github.com/puppeteer/puppeteer/issues/299
            await this.#Page._client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: path.resolve(downloadDir),
            });
            await this.#Page.waitForTimeout(15000)
            // enter start date
            await this.#Page.waitForSelector('#fromDate2', {visible: true})
            await this.#Page.click('#fromDate2')
            await this.#Page.evaluate(()=> document.querySelector('#fromDate2').focus())
            await this.#Page.waitForTimeout(500)
            await this.#Page.evaluate(()=> document.querySelector('#fromDate2').value='')
            await this.#Page.waitForTimeout(500)
            await this.#Page.keyboard.type(format(new Date(rDate.start),'MM/DD/YYYY'), {
                delay: randomInt(100, 400),
            })
            // enter end date
            await this.#Page.waitForSelector('#toDate2', {visible: true})
            await this.#Page.click('#toDate2')
            await this.#Page.evaluate(()=> document.querySelector('#toDate2').focus())
            await this.#Page.waitForTimeout(500)
            await this.#Page.evaluate(()=> document.querySelector('#toDate2').value='')
            await this.#Page.waitForTimeout(500)
            await this.#Page.keyboard.type(format(new Date(rDate.end),'MM/DD/YYYY'), {
                delay: randomInt(100, 400),
            })
            await this.#Page.waitForTimeout(1500)
            // submit
            await this.#Page.keyboard.press('Enter')
            await this.#Page.waitForTimeout(5000)
            await this.#Page.waitForSelector('table#dataTable', {visible: true})
            await this.#Page.waitForSelector('div#export',{visible: true})
            await this.#Page.evaluate(()=> document.querySelector('div#export ul.actionsDDsub').style.display='block')
            await this.#Page.waitForTimeout(1500)
            await this.#Page.waitForSelector('span#downloadCSV', {visible: true})
            // start download
            await this.#Page.click('span#downloadCSV')
            const dwMenu = await this.#Page.evaluate(()=> document.querySelector('div#export ul.actionsDDsub').style.display)
            if(dwMenu === 'block'){
                await this.#Page.waitForTimeout(3000)
                await this.#Page.click('#downloadCSV') // bug fix
            }
            await this.#Page.waitForTimeout(10000) // wait for download
            // TODO: ...to be continued
            // https://github.com/puppeteer/puppeteer/issues/299
        })
    }

    async #getDownloads(dir) {
        return new Promise((resolve, reject) => {
            fsc.readdir(dir, (error, files) => {
                if (error) {
                    return reject(error);
                }
                Promise.all(files.map((file) => {
                    return new Promise((resolve, reject) => {
                        const filepath = path.join(dir, file);
                        fsc.stat(filepath, (error, stats) => {
                            if (error) {
                                return reject(error);
                            }
                            if (stats.isDirectory()) {
                                this.#getDownloads(filepath).then(resolve);
                            } else if (stats.isFile()) {
                                resolve(filepath);
                            }
                        });
                    });
                }))
                    .then((foldersContents) => {
                        resolve(foldersContents.reduce((all, folderContents) => all.concat(folderContents), []));
                    });
            });
        });
    }

    /**
     * Sets the Accounts and Page Menu Attributes
     * @return void
     */
    async #setAccounts(){
        await this.#Page.waitForSelector('#sc-mkt-switcher')
        await this.#setAccountSelected()
        await this.#Page.click('#sc-mkt-switcher') // open
        await this.#Page.waitForSelector('input[type="checkbox"]')
        // set merchant group id
        await this.#Page.evaluate(() => document.querySelectorAll('input[type="checkbox"]')
            .forEach(c => c.parentElement.setAttribute('id',c.getAttribute('id')
                .replace('amzn1.pa.o.','merchant_'))))
        // set merchant label id
        await this.#Page.evaluate(() => document.querySelectorAll('.partner-label')
            .forEach(c => c.setAttribute('id',c.getAttribute('for')
                .replace('amzn1.pa.o.','merchant_label_'))))

        if(this.#Accounts.length < 1) {
            await this.#Page.waitForSelector('.partner-level')
            this.#Accounts = await this.#Page.$$eval('.partner-level', items => {
                return items.map(item => {
                    return {
                        merchant: item.querySelector('input')
                            .getAttribute('id')
                            .replace('amzn1.pa.o.', ''),
                        name: item.querySelector('label.partner-label').innerHTML,
                        markets: Array.from(item.querySelectorAll('a'))
                            .map(link => link.getAttribute('id'))
                            .map(m => {
                                return {
                                    marketplace: m,
                                    selected: false,
                                    processed: false
                                }
                            })
                    }
                })
            });
            this.#Accounts.forEach(a => {
                a.excluded = inarray(this.#Options.exclude.merchantIds, a.merchant)
                a.markets.forEach(m => {
                    if(a.excluded){
                        m.excluded=true
                    } else {
                        m.excluded = inarray(this.#Options.exclude.marketplaceIds, m.marketplace)
                    }
                })
            })
        }
        await this.#setAccountMap()
        await this.#Page.click('#sc-mkt-switcher') // close
    }

    /**
     * Switches Account to merchant + marketplace pair
     * @param {string} merchant - The seller ID
     * @param {string} marketplace - The marketplace ID
     * @return void
     */
    async #setAccountChange(merchant,marketplace) {
        await this.#Page.waitForSelector('#sc-mkt-switcher')
        await this.#Page.click('#sc-mkt-switcher') // open
        await this.#Page.waitForSelector('input[type="checkbox"]')
        await this.#Page.waitForTimeout(3000)
        // clicking account menu marketplace
        console.log('CLICKING...', merchant, marketplace)
        await this.#Page.click('#merchant_'+merchant+' a#'+marketplace).catch(async ()=>{
            await this.#Page.waitForTimeout(5000)
            await this.#Page.waitForSelector('#merchant_label_' + merchant)
            await this.#Page.click('#merchant_label_' + merchant)
            await this.#Page.click('#merchant_'+merchant+' a#'+marketplace)
        })
        await this.#Page.waitForTimeout(5000) // page changed
        // navigating to reports dashboard
        await this.#Page.goto(this.#ReportsUrl, {
            waitUntil: 'networkidle0',
        });
        await this.#Page.waitForTimeout(5000) // page changed again
        await this.#setAccounts()
    }

    /**
     * Sets the selected Account
     * @return void
     */
    async #setAccountSelected(){
        await this.#Page.waitForSelector('#partner-switcher')
        this.#AccountSelected = await this.#Page.$eval('#partner-switcher', i => {
            return {
                merchant: i.getAttribute('data-merchant_selection')
                    .replace('amzn1.merchant.o.',''),
                marketplace: i.getAttribute('data-marketplace_selection'),
                partner: i.getAttribute('data-partner_selection')
                    .replace('amzn1.pa.o.','')
            }
        })
    }

    /**
     * Maps Accounts status and selected
     * @return void
     */
    async #setAccountMap(){
        this.#Accounts.forEach(a => {
            // set selected
            if(a.merchant === this.#AccountSelected.partner){
                a.markets.find(m => m.marketplace === this.#AccountSelected.marketplace).selected=true
            }
            // set processed
            a.markets.filter(m => {
                if(this.#AccountsProcessed.find(p => p.merchant === a.merchant && p.marketplace === m.marketplace)){
                    m.processed=true
                }
            })
        })
    }

    /**
     * Sets a merchant+marketplace pair as complete
     * @param {string} merchant - The seller ID
     * @param {string} marketplace - The marketplace ID
     * @return void
     */
    async #setAccountProcessed(merchant,marketplace){
        await this.#AccountsProcessed.push({
            merchant: merchant,
            marketplace: marketplace
        })
        await this.#setAccountMap()
    }
}
/**
 * One-Time Password Resolution Settings
 * @typedef {Object} otpSettings
 * @property {string} TWILIO_ACCOUNT_SID - Twilio account sid
 * @property {string} TWILIO_AUTH_TOKEN - Twilio account auth token
 */

/**
 * Captcha Resolution Settings
 * @typedef {Object} captchaSettings
 * @property {string} TWOCAPTCHA_API_KEY - 2captcha api key
 */

/**
 * The settings object.
 * @typedef {Object} settingsObject
 * @property {string} loginEmail - seller central login email address or phone number
 * @property {string} loginPass - seller central login password
 * @property {otpSettings} otp - One-Time Password retrieval credentials
 * @property {captchaSettings} captcha - Captcha resolution credentials
 */

/**
 * Download Business Reports from Amazon Seller Central
 * @param {settingsObject} settings - The Settings Object
 * @param {array[]} dates - Array of Date Ranges for Reports
 * @param {object} options - The Options Settings Object
 * @return {Promise<module:stream.internal.Readable|false>}
 */
module.exports = async (settings, dates, options) => {
    const bizReports = new SellerCentralBusinessReports()
    return await bizReports.getReports(settings, dates, options)
}