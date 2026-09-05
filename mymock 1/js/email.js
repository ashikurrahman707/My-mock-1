// ============================================================
// My-Mock — email verification + Google Sheet logging
// ------------------------------------------------------------
// Both of these work WITHOUT a real backend server:
//
// 1) EmailJS (https://www.emailjs.com) lets a website send email
//    directly from the browser using a connected Gmail account,
//    free for a generous monthly quota, no card required.
//
// 2) A Google Apps Script "Web App" deployed from inside the
//    target Google Sheet gives you a free POST endpoint that
//    appends a row — no service account, no billing.
//
// Fill in the CONFIG values below after completing the two short
// setup guides included in SETUP.md. Until they're filled in,
// both services log to the console instead of failing loudly,
// so the rest of the site keeps working during development.
// ============================================================

const CONFIG = {
  EMAILJS_PUBLIC_KEY: "",     // from EmailJS dashboard → Account
  EMAILJS_SERVICE_ID: "",     // from EmailJS dashboard → Email Services (connect easyieltsforeveryone@gmail.com here)
  EMAILJS_TEMPLATE_ID: "",    // from EmailJS dashboard → Email Templates
  SHEETS_WEBAPP_URL: "",      // from your deployed Google Apps Script Web App
};

const EmailService = {
  async sendVerificationCode(toEmail, toName, code) {
    if (!CONFIG.EMAILJS_PUBLIC_KEY || !CONFIG.EMAILJS_SERVICE_ID || !CONFIG.EMAILJS_TEMPLATE_ID) {
      console.warn(
        `[My-Mock] EmailJS is not configured yet — verification code for ${toEmail} is: ${code}\n` +
        `(This is shown in the console only because email sending isn't set up. See SETUP.md.)`
      );
      // Surface it in the UI too during development so signup is testable end-to-end.
      window.__mymock_last_code = code;
      return { simulated: true, code };
    }

    if (typeof emailjs === "undefined") {
      throw new Error("EmailJS SDK failed to load. Check your internet connection.");
    }

    return emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_ID, {
      to_email: toEmail,
      to_name: toName,
      verification_code: code,
      from_name: "My-Mock — IELTS Speaking Practice",
    }, CONFIG.EMAILJS_PUBLIC_KEY);
  },
};

const SheetService = {
  async logVerifiedUser(user) {
    if (!CONFIG.SHEETS_WEBAPP_URL) {
      console.info(`[My-Mock] Google Sheets logging not configured — would have logged: ${user.name} <${user.email}>`);
      return { simulated: true };
    }
    return fetch(CONFIG.SHEETS_WEBAPP_URL, {
      method: "POST",
      mode: "no-cors", // Apps Script web apps commonly require this from a browser
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        name: user.name,
        email: user.email,
        verifiedAt: new Date().toISOString(),
      }),
    });
  },
};

window.MyMock = window.MyMock || {};
window.MyMock.EmailService = EmailService;
window.MyMock.SheetService = SheetService;
window.MyMock.CONFIG = CONFIG;
