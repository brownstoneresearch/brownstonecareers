PRAGMA foreign_keys = ON;

-- Moves the detailed public application into the authenticated candidate workflow.
INSERT OR IGNORE INTO onboarding_tasks
(id, title, description, category, role_scope, requires_submission, requires_signature, requires_admin_review, form_schema_json, instructions, sort_order, status, created_at, updated_at)
VALUES
('confidential-candidate-application',
 'Confidential candidate application',
 'Complete the detailed Brownstone Careers candidate application, attach your resume to private storage, sign the accuracy attestation, and submit it for administrator review.',
 'application',
 '*',
 1,
 1,
 1,
 '{"fields":[{"name":"phone","label":"Phone number","type":"tel","required":true},{"name":"city","label":"City","type":"text","required":true},{"name":"stateProvince","label":"State / province","type":"text","required":true},{"name":"country","label":"Country","type":"text","required":true},{"name":"workAuthorization","label":"Authorized to work in the United States?","type":"select","options":["Yes","No"],"required":true},{"name":"sponsorshipRequired","label":"Will you require employment sponsorship?","type":"select","options":["No","Yes"],"required":true},{"name":"role","label":"Role of interest","type":"select","options":["Finance Administrator","Data Entry Specialist","Customer Service Representative","Administrative Assistant","Virtual Assistant","Recruitment Coordinator","Other"],"required":true},{"name":"timezone","label":"Time zone","type":"text","required":true},{"name":"startDate","label":"Available start date","type":"date","required":true},{"name":"yearsExperience","label":"Years of working experience","type":"select","options":["Less than 1 year","1\u20132 years","3\u20135 years","6\u201310 years","More than 10 years"],"required":true},{"name":"recentJobTitle","label":"Most recent job title","type":"text","required":true},{"name":"recentEmployer","label":"Most recent employer","type":"text","required":true},{"name":"employmentPeriod","label":"Employment period","type":"text","required":true},{"name":"experience","label":"Working experience and achievements","type":"textarea","required":true},{"name":"interest","label":"Why are you interested in this role?","type":"textarea","required":true},{"name":"skills","label":"Software and technical skills","type":"textarea","required":true},{"name":"readiness","label":"Remote-work readiness","type":"textarea","required":true},{"name":"resume","label":"Resume or CV","type":"file","accept":".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document","category":"application-resume","help":"PDF, DOC, or DOCX only. Maximum 5 MB. Stored in private document storage.","required":true}],"attestation":"I certify that this confidential application is accurate, complete, and submitted by me."}',
 'Provide truthful, role-relevant information. Do not enter SSNs, banking credentials, tax information, passwords, PINs, or government ID numbers in this application. Use the Secure Identity Center only when separately authorized.',
 5,
 'active',
 datetime('now'),
 datetime('now'));
