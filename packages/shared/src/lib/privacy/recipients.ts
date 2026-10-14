/*
 * Who an account holder's data goes to, as the owner's "Download my data" file lists it (DPDP Act s.11(1)(b): who the data
 * has been shared with). The register is docs/operations/processors.md; this is the part of it that concerns people who hold
 * an account, in the words the owner reads. A test checks every vendor here is still named in that file, so a vendor added or
 * dropped there cannot be forgotten here.
 */

import { ambientBrandShortName } from "../deployment-brand";

export interface DataRecipient {
  /** The vendor's name as docs/operations/processors.md writes it. */
  readonly name: string;
  /** What it does for Fynix. */
  readonly service: string;
  /** What of the owner's data it receives. */
  readonly receives: string;
  readonly location: string;
}

export const DATA_RECIPIENTS: readonly DataRecipient[] = [
  { name: "Hostinger", service: "Servers, database and file storage", receives: "Everything you give us", location: "Mumbai, India" },
  { name: "Cloudflare", service: "Passes web traffic through, and keeps encrypted backups and public media", receives: "Your web traffic, and what you upload", location: "Worldwide network" },
  { name: "Brevo", service: `Emails you the codes you ask for, and alerts the ${ambientBrandShortName()} team about support requests and feedback`, receives: "Your email address and the code, and the text of a request you send us, with your name and number", location: "European Union" },
  { name: "Razorpay", service: "Takes payments", receives: "Your mobile number, to fill in the payment form, and the payment details you enter there", location: "India" },
  { name: "Sentry", service: "Finds faults in the service", receives: "Fault reports with personal details removed", location: "United States" },
  { name: "Zoho", service: "The support and grievance mailbox", receives: "Anything you write to us by email", location: "India" },
  { name: "Google", service: "Only if you choose to import your Google Business Profile", receives: "Your Google sign-in token and business details, at your request", location: "United States" },
];
