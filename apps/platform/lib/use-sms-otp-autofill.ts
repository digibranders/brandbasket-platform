"use client";

import { useEffect, useState } from "react";
import { createSmsOtpReceiver, type SmsOtpReceiver } from "./sms-otp-receiver";

/** Own the receiver in the whole flow, rather than the input step that appears after sending the code. */
export function useSmsOtpAutofill(onCode: (otpId: string, code: string) => void): SmsOtpReceiver {
  const [receiver] = useState(() => createSmsOtpReceiver(onCode));

  useEffect(() => {
    receiver.setHandler(onCode);
  }, [receiver, onCode]);

  useEffect(() => {
    window.addEventListener("pagehide", receiver.cancel);
    return () => {
      window.removeEventListener("pagehide", receiver.cancel);
      receiver.cancel();
    };
  }, [receiver]);

  return receiver;
}
