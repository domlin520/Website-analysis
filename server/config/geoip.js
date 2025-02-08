export const geoipConfig = {
    accountId: process.env.MAXMIND_ACCOUNT_ID,
    licenseKey: process.env.MAXMIND_LICENSE_KEY,
    editionIds: process.env.MAXMIND_EDITION_IDS?.split(',') || []
};