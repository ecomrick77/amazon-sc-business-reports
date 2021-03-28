# amazon-sc-business-reports

**Automated Amazon Seller Central Business Reports Downloader**

Amazon's Seller Central Business Reports provide valuable insights for retailers that are not available through any Report Scheduling or API. This package uses Puppeteer to control a Chrome browser that navigates Seller Central, downloading all the reports and returning the results in JSON.

**Requirements:**

- **[Twilio](https://www.twilio.com/)** - In order to provide automated One Time Password (OTP) Two-Step Authorization you'll need to add a Twilio Phone Number to your Amazon Seller Account and provide the API credentials in the settings.
- **[2Captcha](https://2captcha.com/)** - In order to provide automated Captcha Image resolution you'll need to provide the API key in the settings

## Basic Usage

```javascript
const bizReports = require('amazon-sc-business-reports')
const settings = {
    loginEmail: 'amz.systems@example.com',
    loginPass: 'XXXXXXXXXXXXXXX',
    otp: {
        TWILIO_ACCOUNT_SID: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        TWILIO_AUTH_TOKEN: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    },
    captcha: {
        TWOCAPTCHA_API_KEY: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    }
}
const dates = [
    ['2021-01-21','2021-01-27']
]
const options = {}
bizReports(settings,dates,options).then(stream => {
    stream.on('data', (r) => {
        console.log(r)
        // stream example
        stream.pause();
        console.log('There will be no additional data for 5 seconds.');
        setTimeout(() => {
            stream.resume();
        }, 5000);

    })
    stream.on('end', ()=>{
        console.log('done')
    })
})
```