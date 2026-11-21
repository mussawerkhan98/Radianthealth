-- Physiotherapy (at home and in clinic) is the main service:
-- list the department first, let its doctors take home visits, and give its
-- page starter content where nothing has been written yet (Admin → Departments → Edit page).

UPDATE "Department" SET "sortOrder" = -100
WHERE "active" = 1 AND (lower("name") LIKE '%physio%' OR "icon" = 'physio');

UPDATE "Doctor" SET "offersHomeVisit" = 1
WHERE "active" = 1 AND "departmentId" IN (
  SELECT "id" FROM "Department" WHERE lower("name") LIKE '%physio%' OR "icon" = 'physio'
);

UPDATE "Department" SET "tagline" = 'Expert physiotherapy at home or in our clinic'
WHERE (lower("name") LIKE '%physio%' OR "icon" = 'physio') AND "tagline" = '';

UPDATE "Department" SET "about" = 'Our physiotherapists help you move better, ease pain and recover after injury or surgery — in our clinic, or at home when travelling is difficult.

Every course of treatment starts with a one-to-one assessment. Together we agree clear goals, then combine hands-on treatment with simple exercises you can do between sessions. Because our physiotherapists work alongside our specialist doctors, your care stays coordinated if you need scans, a medical opinion or a referral.

Home visits are ideal after surgery, for older family members, for people living with a neurological condition, or whenever getting to a clinic is a struggle. Choose "Home visit" when you book and add your address.'
WHERE (lower("name") LIKE '%physio%' OR "icon" = 'physio') AND "about" = '';

UPDATE "Department" SET "services" = 'Home physiotherapy visits
Clinic physiotherapy sessions
Post-surgery rehabilitation
Sports injury rehabilitation
Neurological and stroke rehabilitation
Elderly mobility and fall prevention
Manual therapy and joint mobilisation
Personal home exercise programmes'
WHERE (lower("name") LIKE '%physio%' OR "icon" = 'physio') AND "services" = '';

UPDATE "Department" SET "conditions" = 'Back pain
Neck pain
Shoulder pain
Knee pain
Sports injuries
Sprains and strains
Arthritis
After knee or hip replacement
After fractures
Stroke recovery
Balance problems
Posture and work-related pain'
WHERE (lower("name") LIKE '%physio%' OR "icon" = 'physio') AND "conditions" = '';

UPDATE "Department" SET "faqs" = '[{"q":"Can a physiotherapist come to my home?","a":"Yes. Choose \"Home visit\" when you book online, pick a time and enter your address. You can also book a home visit by phone or WhatsApp."},{"q":"What should I prepare for a home session?","a":"A little clear space to move, comfortable clothes, and any scans, reports or discharge letters you have. Your physiotherapist will tell you if anything else is needed."},{"q":"Do I need a referral?","a":"You can book physiotherapy directly. Some insurance plans ask for a doctor''s referral — check with us and our doctors can help if one is needed."},{"q":"How many sessions will I need?","a":"It depends on your condition and goals. After your assessment your physiotherapist will explain the plan and how progress will be reviewed."}]'
WHERE (lower("name") LIKE '%physio%' OR "icon" = 'physio') AND "faqs" IN ('', '[]');
