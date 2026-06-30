// data/sampleDocs.js
// Two realistic sample documents with mixed PII and deliberate near-misses
// to make the "why wasn't this redacted?" feature meaningful.

export const sampleDocs = [
  {
    id: "doc_001",
    title: "Insurance Claim — John Anderson",
    text: `Dear John Anderson,

Thank you for submitting your insurance claim on March 15, 2024. Our records show that your policy number is HX-8821-99 and your date of birth on file is April 3, 1982.

We have processed your request and will be sending correspondence to your home address at 47 Elmwood Drive, Austin, TX 78701. If you need to reach our claims department, please call us at (512) 440-9823 or email claims@nexushealth.com.

For identity verification, your file references the Social Security Number ending in 7741 (full number: 523-88-7741). Please confirm this matches your records.

Note: Your claim was reviewed by our compliance team at Nexus Health Partners — this is a standard procedure and does not indicate any issue with your claim. The review was completed on April 10, 2024, which is within our standard 30-day processing window.

We look forward to resolving this matter promptly.

Sincerely,
Patricia Owens
Senior Claims Adjuster
Nexus Health Partners`,
  },
  {
    id: "doc_002",
    title: "Employment Offer Letter — Sarah Chen",
    text: `Dear Sarah Chen,

We are pleased to offer you the position of Senior Software Engineer at Brightline Technologies, Inc., effective June 1, 2024.

Your starting salary will be $145,000 per year, paid bi-weekly. Please report to our offices at 200 Market Street, Suite 400, San Francisco, CA 94105 on your first day.

As part of onboarding, HR will require your Social Security Number (SSN) for tax filing purposes: 412-77-9302. Additionally, please provide your personal email at s.chen.personal@gmail.com for account setup coordination — note that your work email will be sarah.chen@brightline.io.

Your direct manager will be David Kowalski (d.kowalski@brightline.io), who will reach out to arrange your onboarding schedule. Our standard probationary period is 90 days, which aligns with California employment law.

Please confirm your acceptance by signing and returning this letter no later than May 20, 2024.

Warm regards,
Rebecca Holt
VP of People Operations
Brightline Technologies, Inc.`,
  },
];
