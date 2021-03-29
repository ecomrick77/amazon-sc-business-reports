# amazon-sc-business-reports

**Automated Amazon Seller Central Business Reports Downloader**

Amazon's Seller Central Business Reports provide valuable insights for retailers that are not available through any Report Scheduling or API. This package uses Puppeteer to control a headless Chrome browser which navigates Seller Central, downloading all the reports (for each merchant and marketplace) and returning the results in JSON.

**Requirements:**

- **[Twilio](https://www.twilio.com/)** - In order to provide automated One Time Password (OTP) Two-Step Authorization you'll need to add a Twilio Phone Number to your Amazon Seller Account and provide the API credentials in the settings.
- **[2Captcha](https://2captcha.com/)** - In order to provide automated Captcha Image resolution you'll need to provide the API key in the settings

## Installation

```shell
$ npm i amazon-sc-business-reports
```

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
    ['2021-01-26','2021-01-27'] // from,to
]
const options = {}
bizReports(settings,dates,options).then(stream => {
    stream.on('data', (r) => {
        console.log(r)
        // stream pausing example
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

## Settings

Parameters for the `settings` object:

- `loginEmail` - Seller Central login email address or phone number.
- `loginPass` - Seller Central login password.
- `otp` - Twilio credentials object:
  - `TWILIO_ACCOUNT_SID`
  -  `TWILIO_AUTH_TOKEN`
- `captcha` - 2Captcha credentials object:
  - `TWOCAPTCHA_API_KEY`

## Dates

Reports will be downloaded for all the `dates` in the parameters.

Dates is an Array of Arrays containing 2-values (From Date, To Date):

```javascript
// reports per day
[
    ['2021-01-26','2021-01-26'], // from,to
    ['2021-01-27','2021-01-27'], // from,to
]

// report for period
[
    ['2021-01-26','2021-01-27'], // from,to
]

```

## Options

By Default all Reports are downloaded for each Merchant and Marketplace in the Seller Central account. You may Enable or Disable Reports, Merchants and Marketplaces with the `options` object.

```javascript
{
    reports: {
        SalesTraffic: true,
        DetailSalesTraffic: false, // exclude this report (for example)
        SellerPerformance: true,
        DetailSalesTrafficBySKU: true,
        DetailSalesTrafficByParent: true,
        DetailSalesTrafficByChild: true,
        BrandPerformance: true
    },
    exclude: {
        merchantIds: [],
        marketplaceIds: [
            'A2EUQ1WTGCTBG2' // exclude Amazon Canada reports (for example)
        ]
    }
}
```

## Reports

Here are some Report Response Examples. 

Currencies are returned in the local marketplace currency often prefixed with a 3-digit country code (Example: Can$619.90, MXN$4,829.37). 

### SalesTraffic:

```javascript
{
    merchant: 'XXXXXXXXXXXXXX',
    marketplace: 'ATVPDKIKX0DER',
    report: 'SalesTraffic',
    reportId: 'SalesTrafficTimeSeries',
    period: { from: '2021-01-26', to: '2021-01-26' },
    rows: [
        {
            date: '01/26/2021',
            orderedProductSales: '$6,232.32',
            orderedProductSalesB2B: '$264.96',
            unitsOrdered: 68,
            unitsOrderedB2B: 4,
            totalOrderItems: 60,
            totalOrderItemsB2B: 4,
            averageSalesPerOrderItem: '$103.87',
            averageSalesPerOrderItemB2B: '$66.24',
            averageUnitsPerOrderItem: 1.13,
            averageUnitsPerOrderItemB2B: 1,
            averageSellingPrice: '$91.65',
            averageSellingPriceB2B: '$66.24',
            sessions: '1,017',
            orderItemSessionPercentage: '5.90%',
            orderItemSessionPercentageB2B: '0.39%',
            averageOfferCount: 453
        },
        ...
    ]
}
```

### DetailSalesTraffic:

```javascript
{
    merchant: 'XXXXXXXXXXXXXX',
    marketplace: 'ATVPDKIKX0DER',
    report: 'DetailSalesTraffic',
    reportId: 'DetailSalesTrafficByTime',
    period: { from: '2021-01-26', to: '2021-01-26' },
    rows: [
        {
            date: '01/26/2021',
            orderedProductSales: '$6,232.32',
            orderedProductSalesB2B: '$264.96',
            unitsOrdered: 68,
            unitsOrderedB2B: 4,
            totalOrderItems: 60,
            totalOrderItemsB2B: 4,
            pageViews: '1,410',
            sessions: '1,017',
            buyBoxPercentage: '93%',
            unitSessionPercentage: '6.69%',
            unitSessionPercentageB2B: '0.39%',
            averageOfferCount: 453,
            averageParentItems: 100
        },
        ...
    ]
}
```

### SellerPerformance:

```javascript
{
    merchant: 'XXXXXXXXXXXXXX',
    marketplace: 'ATVPDKIKX0DER',
    report: 'SellerPerformance',
    reportId: 'SellerPerformanceForMerchants',
    period: { from: '2021-01-26', to: '2021-01-26' },
    rows: [
        {
            date: '01/26/2021',
            orderedProductSales: '$619.90',
            orderedProductSalesB2B: '$0.00',
            unitsOrdered: 12,
            unitsOrderedB2B: 0,
            totalOrderItems: 12,
            totalOrderItemsB2B: 0,
            unitsRefunded: 5,
            refundRate: '41.67%',
            feedbackReceived: 1,
            negativeFeedbackReceived: 0,
            receivedNegativeFeedbackRate: '0.00%',
            aToZClaimsGranted: 0,
            claimsAmount: '$0.00'
        },
        ...
    ]
}
```

### DetailSalesTrafficBySKU:

```javascript
{
    merchant: 'XXXXXXXXXXXXXX',
    marketplace: 'ATVPDKIKX0DER',
    report: 'DetailSalesTrafficBySKU',
    reportId: 'DetailSalesTrafficBySKU',
    period: { from: '2021-01-26', to: '2021-01-26' },
    rows: [
        {
            parentAsin: 'XXXXXXXXXX',
            childAsin: 'XXXXXXXXXX',
            title: 'Some Product Name (White, S/M)',
            sku: 'ABC-123',
            sessions: 17,
            sessionPercentage: '0.66%',
            pageViews: 21,
            pageViewsPercentage: '0.56%',
            buyBoxPercentage: '62%',
            unitsOrdered: 3,
            unitsOrderedB2B: 1,
            unitSessionPercentage: '17.65%',
            unitSessionPercentageB2B: '5.88%',
            orderedProductSales: '$129.03',
            orderedProductSalesB2B: '$42.79',
            totalOrderItems: 3,
            totalOrderItemsB2B: 1
        },
        ...
    ]
}
```

### DetailSalesTrafficByParent:

```javascript
{
    merchant: 'XXXXXXXXXXXXXX',
    marketplace: 'ATVPDKIKX0DER',
    report: 'DetailSalesTrafficByParent',
    reportId: 'DetailSalesTrafficByParentItem',
    period: { from: '2021-01-26', to: '2021-01-26' },
    rows: [
        {
            parentAsin: 'XXXXXXXXXX',
            title: '',
            sessions: 69,
            sessionPercentage: '6.78%',
            pageViews: 104,
            pageViewsPercentage: '7.38%',
            buyBoxPercentage: '99%',
            unitsOrdered: 6,
            unitsOrderedB2B: 2,
            unitSessionPercentage: '8.70%',
            unitSessionPercentageB2B: '2.90%',
            orderedProductSales: '$357.77',
            orderedProductSalesB2B: '$127.78',
            totalOrderItems: 6,
            totalOrderItemsB2B: 2
        },
        ...
    ]
}
```

### DetailSalesTrafficByChild:

```javascript
{
    merchant: 'XXXXXXXXXXXXXX',
    marketplace: 'ATVPDKIKX0DER',
    report: 'DetailSalesTrafficByChild',
    reportId: 'DetailSalesTrafficByChildItem',
    period: { from: '2021-01-26', to: '2021-01-26' },
    rows: [
        {
            parentAsin: 'XXXXXXXXXX',
            childAsin: 'XXXXXXXXXX',
            title: 'Some Product Name (White, S/M)',
            sessions: 7,
            sessionPercentage: '0.69%',
            pageViews: 14,
            pageViewsPercentage: '0.99%',
            buyBoxPercentage: '100%',
            unitsOrdered: 2,
            unitsOrderedB2B: 2,
            unitSessionPercentage: '28.57%',
            unitSessionPercentageB2B: '28.57%',
            orderedProductSales: '$127.78',
            orderedProductSalesB2B: '$127.78',
            totalOrderItems: 2,
            totalOrderItemsB2B: 2
        },
        ...
    ]
}
```

### BrandPerformance:

```javascript
{
    merchant: 'XXXXXXXXXXXXXX',
    marketplace: 'ATVPDKIKX0DER',
    report: 'BrandPerformance',
    reportId: 'BrandPerformannce',
    period: { from: '2021-01-26', to: '2021-01-26' },
    rows: [
        {
            asin: 'XXXXXXXXXX',
            globalCatalogIdentifier: 'null',
            title: 'Some Product Name (White, S/M)',
            brandName: 'Some Brand',
            averageCustomerReview: 0,
            customerReviewsReceived: 0,
            salesRank: '18,627',
            buyBoxPercentage: '100%'
        },
        ...
    ]
}
```

