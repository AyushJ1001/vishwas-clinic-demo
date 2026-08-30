export type CatalogGroup = { group: string; items: string[] };

export const symptoms: CatalogGroup[] = [
  { group: 'Fever', items: ['Low-grade fever', 'High-grade fever', 'Intermittent fever', 'Continuous fever', 'Fever with chills', 'Fever with rash', 'Fever after travel'] },
  { group: 'Respiratory', items: ['Dry cough', 'Productive cough', 'Sore throat', 'Nasal congestion', 'Runny nose', 'Shortness of breath', 'Wheezing', 'Chest tightness'] },
  { group: 'Digestive', items: ['Nausea', 'Vomiting', 'Loose stools', 'Constipation', 'Acidity', 'Bloating', 'Abdominal pain', 'Loss of appetite'] },
  { group: 'Pain', items: ['Headache', 'Body ache', 'Back pain', 'Joint pain', 'Chest pain', 'Neck pain', 'Ear pain', 'Toothache'] },
  { group: 'General', items: ['Fatigue', 'Dizziness', 'Weakness', 'Sleep disturbance', 'Weight loss', 'Weight gain', 'Swelling', 'Reduced activity'] },
];

export const findings: CatalogGroup[] = [
  { group: 'General examination', items: ['Alert and oriented', 'Mild dehydration', 'Pallor present', 'Icterus absent', 'Pedal edema', 'Lymph nodes palpable'] },
  { group: 'ENT', items: ['Throat congestion', 'Tonsillar enlargement', 'Nasal mucosal edema', 'Ear canal inflammation', 'Sinus tenderness', 'Oral ulcers'] },
  { group: 'Respiratory', items: ['Air entry equal', 'Crepitations', 'Rhonchi', 'Wheeze present', 'Reduced air entry', 'No respiratory distress'] },
  { group: 'Cardiovascular', items: ['Heart sounds normal', 'Regular rhythm', 'Tachycardia', 'Bradycardia', 'Murmur heard', 'Peripheral pulses palpable'] },
  { group: 'Abdomen', items: ['Soft and non-tender', 'Epigastric tenderness', 'Right iliac fossa tenderness', 'Bowel sounds present', 'Guarding absent', 'Organomegaly absent'] },
];

export const diagnoses: CatalogGroup[] = [
  { group: 'Respiratory', items: ['Viral upper respiratory tract infection', 'Acute pharyngitis', 'Acute tonsillitis', 'Allergic rhinitis', 'Acute sinusitis', 'Bronchitis', 'Bronchial asthma'] },
  { group: 'Gastrointestinal', items: ['Acute gastroenteritis', 'Gastritis', 'Gastroesophageal reflux disease', 'Constipation', 'Food intolerance', 'Irritable bowel syndrome'] },
  { group: 'Metabolic', items: ['Type 2 diabetes mellitus', 'Prediabetes', 'Hypothyroidism', 'Hyperthyroidism', 'Dyslipidemia', 'Vitamin D deficiency'] },
  { group: 'Musculoskeletal', items: ['Mechanical low back pain', 'Cervical strain', 'Muscle spasm', 'Osteoarthritis', 'Plantar fasciitis', 'Soft tissue injury'] },
  { group: 'General practice', items: ['Essential hypertension', 'Migraine', 'Tension headache', 'Urinary tract infection', 'Contact dermatitis', 'Anxiety symptoms'] },
];

export const medicines: CatalogGroup[] = [
  { group: 'Pain and fever', items: ['Paracetamol 500 mg', 'Paracetamol 650 mg', 'Ibuprofen 200 mg', 'Ibuprofen 400 mg', 'Diclofenac 50 mg', 'Naproxen 250 mg'] },
  { group: 'Allergy and respiratory', items: ['Cetirizine 10 mg', 'Levocetirizine 5 mg', 'Fexofenadine 120 mg', 'Montelukast 10 mg', 'Salbutamol inhaler', 'Budesonide inhaler'] },
  { group: 'Gastrointestinal', items: ['Pantoprazole 40 mg', 'Omeprazole 20 mg', 'Famotidine 20 mg', 'Ondansetron 4 mg', 'ORS sachet', 'Lactulose solution'] },
  { group: 'Antimicrobials', items: ['Amoxicillin 500 mg', 'Amoxicillin–clavulanate 625 mg', 'Azithromycin 500 mg', 'Cefixime 200 mg', 'Doxycycline 100 mg', 'Nitrofurantoin 100 mg'] },
  { group: 'Metabolic and chronic care', items: ['Metformin 500 mg', 'Amlodipine 5 mg', 'Telmisartan 40 mg', 'Atorvastatin 10 mg', 'Levothyroxine 50 mcg', 'Cholecalciferol 60,000 IU'] },
];

export const advice: CatalogGroup[] = [
  { group: 'Hydration and nutrition', items: ['Warm water for drinking', 'Maintain hydration', 'Soft diet', 'Non-spicy non-oily diet', 'Small frequent meals', 'Oral rehydration solution'] },
  { group: 'Respiratory care', items: ['Warm saline gargles', 'Steam inhalation', 'Avoid dust and cold air', 'Use mask in crowded spaces', 'Voice rest', 'Monitor breathing difficulty'] },
  { group: 'Recovery', items: ['Rest as advised', 'Maintain sleep routine', 'Moderate exercise after recovery', 'Follow up as required', 'Bring old reports', 'Return if symptoms worsen'] },
  { group: 'Lifestyle', items: ['Diet improvement', 'Daily walking', 'Weight monitoring', 'Stress management', 'Limit alcohol', 'Stop tobacco use'] },
];

export const investigations: CatalogGroup[] = [
  { group: 'Blood tests', items: ['Complete blood count', 'Blood glucose fasting', 'HbA1c', 'Liver function test', 'Kidney function test', 'Thyroid profile', 'Lipid profile', 'C-reactive protein'] },
  { group: 'Urine and stool', items: ['Urine routine and microscopy', 'Urine culture', 'Stool routine', 'Stool occult blood'] },
  { group: 'Imaging', items: ['Chest X-ray', 'Ultrasound abdomen', 'X-ray affected joint', 'ECG', '2D echocardiography'] },
  { group: 'Point-of-care', items: ['Random blood sugar', 'Blood pressure monitoring', 'Pulse oximetry monitoring', 'Peak flow measurement'] },
];

export const ingredientByMedicine: Record<string, string> = {
  'Paracetamol 500 mg': 'Paracetamol IP 500 mg',
  'Levocetirizine 5 mg': 'Levocetirizine dihydrochloride 5 mg',
  'Pantoprazole 40 mg': 'Pantoprazole sodium equivalent to 40 mg',
  'Azithromycin 500 mg': 'Azithromycin dihydrate equivalent to 500 mg',
  'Metformin 500 mg': 'Metformin hydrochloride 500 mg',
};
