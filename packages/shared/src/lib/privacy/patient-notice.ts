/**
 * The notice a clinic's booking page shows a patient before they book (DPDP Act 2023 s.5 and Rule 3), in the languages
 * the patients speak. The clinic is the one that decides why the details are collected, so the notice names it; {operator}
 * runs the booking page for the clinic and holds the details for it. A client site renders `patientNotice(clinic, language)`
 * above its booking button and posts `PATIENT_NOTICE_VERSION` as `noticeVersion`, which the platform keeps as proof of the
 * notice the patient saw.
 *
 * The Hindi and Marathi texts are a first translation, to be read by a native speaker and by counsel before a clinic
 * relies on them. Change PATIENT_NOTICE_VERSION whenever any text changes, and never reuse a label.
 */

import { ambientBrandShortName } from "../deployment-brand";

export const PATIENT_NOTICE_VERSION = "patient-2026-10";

export const PATIENT_NOTICE_LANGUAGES = ["en", "hi", "mr"] as const;
export type PatientNoticeLanguage = (typeof PATIENT_NOTICE_LANGUAGES)[number];

const TEXTS: Readonly<Record<PatientNoticeLanguage, string>> = {
  en: "{clinic} will use your name and mobile number to confirm your appointment and to contact you about it. We text a code to your number to check it is yours. {operator}, which runs this booking page for {clinic}, keeps these details for the clinic. To see, correct or delete them, ask {clinic}.",
  hi: "{clinic} आपका नाम और मोबाइल नंबर आपकी अपॉइंटमेंट की पुष्टि करने और उसके बारे में आपसे संपर्क करने के लिए इस्तेमाल करेगा। यह नंबर आपका ही है, इसकी जाँच के लिए हम आपके नंबर पर एक कोड भेजते हैं। {operator}, जो {clinic} के लिए यह बुकिंग पेज चलाता है, ये जानकारी क्लिनिक के लिए सँभालकर रखता है। इन्हें देखने, सुधारने या हटवाने के लिए {clinic} से कहें।",
  mr: "{clinic} तुमचे नाव आणि मोबाइल नंबर तुमच्या अपॉइंटमेंटची खात्री करण्यासाठी आणि त्याबद्दल तुमच्याशी संपर्क साधण्यासाठी वापरेल. हा नंबर तुमचाच आहे हे तपासण्यासाठी आम्ही तुमच्या नंबरवर एक कोड पाठवतो. {clinic} साठी हे बुकिंग पेज चालवणारी {operator} ही माहिती क्लिनिकसाठी जपून ठेवते. ती पाहण्यासाठी, दुरुस्त करण्यासाठी किंवा हटवण्यासाठी {clinic} ला सांगा.",
};

/** The notice for `clinic` in `language`; English for a language it does not have. */
export function patientNotice(clinic: string, language: PatientNoticeLanguage, operator: string = ambientBrandShortName()): string {
  const text = TEXTS[language] ?? TEXTS.en;
  // A function as the replacement, so a "$&" or "$1" in a clinic's name is put in as written.
  return text.replaceAll("{operator}", () => operator).replaceAll("{clinic}", () => clinic);
}
