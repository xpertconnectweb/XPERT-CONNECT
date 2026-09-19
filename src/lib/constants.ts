export const COMPANY_NAME = 'Xpert Connect'
export const COMPANY_PHONE = '(844) 973-7866'
export const COMPANY_PHONE_DISPLAY = '1-844-XPERT-NOW'
export const COMPANY_PHONE_TEL = 'tel:+18449737866'
export const COMPANY_EMAIL = 'xpertconnect.web@gmail.com'
export const COMPANY_DOMAIN = 'https://www.844xpert.com'
export const COMPANY_LOGO_URL = `${COMPANY_DOMAIN}/images/logo.png`

/** Registered entity name. Everywhere else the site uses the trading name, COMPANY_NAME. */
export const COMPANY_LEGAL_NAME = '844 Xpert LLC'

/**
 * The HELP contact the client registered with the carrier.
 *
 * It diverges from COMPANY_EMAIL on purpose: this is the address
 * printed in the Messaging Terms, and the toll-free reviewer checks it
 * against the one submitted on the verification form. Folding it into
 * COMPANY_EMAIL breaks that match — ask the client first.
 */
export const SMS_HELP_EMAIL = '4xpertconnect@gmail.com'
