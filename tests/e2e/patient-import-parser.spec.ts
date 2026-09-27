import { expect, test } from "@playwright/test";
import { parsePatientImportText } from "../../app/patient-import";

test("parses pasted tabs, semicolons, and commas with quoted cells", () => {
  const tabbed = parsePatientImportText(
    'patient no.\tpatient name\tphone number\n1\t"कुलकर्णी; आशा"\t+91 98765 43210',
  );
  expect(tabbed.rows).toEqual([
    expect.objectContaining({
      number: "1",
      name: "कुलकर्णी; आशा",
      phone: "+91 98765 43210",
      sourceRow: 2,
    }),
  ]);

  const semicolon = parsePatientImportText(
    'number;name;phone\n2;"Joshi, Asha";098765 43210',
  );
  expect(semicolon.rows[0]).toMatchObject({
    number: "2",
    name: "Joshi, Asha",
    phone: "098765 43210",
  });

  const comma = parsePatientImportText(
    'number,name,phone\n3,"Asha ""Tai"" Patil",98765-43210',
  );
  expect(comma.rows[0]).toMatchObject({
    number: "3",
    name: 'Asha "Tai" Patil',
    phone: "98765-43210",
  });
});

test("strips an Excel UTF-8 byte-order mark", () => {
  const result = parsePatientImportText("\uFEFFPatient Name,Reg No\nआशा पाटील,00123");
  expect(result).toEqual({
    rows: [
      {
        number: "123",
        name: "आशा पाटील",
        age: "",
        dateOfBirth: "",
        sex: "",
        phone: "",
        sourceRow: 2,
      },
    ],
    problems: [],
  });
});

test("uses the same complete alias table for delimited text and JSON", () => {
  const aliases = {
    number: [
      "regno",
      "registrationno",
      "registrationnumber",
      "regnumber",
      "caseno",
      "casenumber",
      "fileno",
      "opdno",
      "patientno",
      "patientnumber",
      "patientid",
      "uhid",
      "mrn",
      "no",
      "number",
      "id",
    ],
    name: [
      "name",
      "patientname",
      "patientsname",
      "nameofpatient",
      "patient",
      "fullname",
    ],
    phone: [
      "phone",
      "phoneno",
      "phonenumber",
      "mobile",
      "mobileno",
      "mobilenumber",
      "mob",
      "mobno",
      "contact",
      "contactno",
      "contactnumber",
      "cell",
      "cellno",
      "tel",
      "telephone",
    ],
    sex: ["sex", "gender", "mf"],
    dateOfBirth: ["dateofbirth", "dob", "birthdate", "born"],
    age: ["age", "ageyears", "ageyrs", "ageinyears", "years"],
  } as const;

  for (const alias of aliases.number) {
    expect(
      parsePatientImportText(JSON.stringify([{ name: "Asha", [alias]: "7" }]))
        .rows[0].number,
    ).toBe("7");
  }
  for (const alias of aliases.name) {
    expect(
      parsePatientImportText(JSON.stringify([{ [alias]: "आशा पाटील" }])).rows[0]
        .name,
    ).toBe("आशा पाटील");
  }
  for (const alias of aliases.phone) {
    expect(
      parsePatientImportText(JSON.stringify([{ name: "Asha", [alias]: "9876543210" }]))
        .rows[0].phone,
    ).toBe("9876543210");
  }
  for (const alias of aliases.sex) {
    expect(
      parsePatientImportText(JSON.stringify([{ name: "Asha", [alias]: "F" }]))
        .rows[0].sex,
    ).toBe("Female");
  }
  for (const alias of aliases.dateOfBirth) {
    expect(
      parsePatientImportText(
        JSON.stringify([{ name: "Asha", [alias]: "31/12/1980" }]),
      ).rows[0].dateOfBirth,
    ).toBe("1980-12-31");
  }
  for (const alias of aliases.age) {
    expect(
      parsePatientImportText(JSON.stringify([{ name: "Asha", [alias]: "45 yrs" }]))
        .rows[0].age,
    ).toBe("45");
  }

  const punctuatedHeaders = parsePatientImportText(
    "Reg. No#;Name/of (Patient);Mobile_No:;Address;Visit date\n42;Asha;9876543210;Pune;01/09/2026",
  );
  expect(punctuatedHeaders.rows[0]).toMatchObject({
    number: "42",
    name: "Asha",
    phone: "9876543210",
  });

  for (const serialHeader of ["srno", "sno", "serialno"]) {
    expect(
      parsePatientImportText(`${serialHeader},name\n99,Asha`).rows[0].number,
    ).toBe("");
  }
});

test("normalises real register date, age, sex, phone, and number values", () => {
  const values = parsePatientImportText(
    JSON.stringify([
      {
        number: "#123",
        name: "Asha",
        dob: "31/12/80",
        age: "45 yrs",
        sex: "F",
        phone: "+91 98765 43210",
      },
      {
        number: "00124",
        name: "Meera",
        dob: "31-Dec-1980",
        age: "45Y",
        sex: "M",
        phone: "098765 43210",
      },
      {
        number: "125",
        name: "Suman",
        dob: "31 Dec 1980",
        age: "45 years",
        sex: "Female",
        phone: "98765-43210",
      },
      {
        number: "126",
        name: "Neela",
        dob: "31 December 1980",
        age: "6 months",
        sex: "Male",
        phone: "9876543210.0",
      },
      { number: "127", name: "बाळ", age: "6m", sex: "स्त्री" },
      { number: "128", name: "मुलगा", age: "45", sex: "पुरुष" },
    ]),
  );

  expect(values.problems).toEqual([]);
  expect(values.rows).toEqual([
    expect.objectContaining({
      number: "123",
      dateOfBirth: "1980-12-31",
      age: "45",
      sex: "Female",
      phone: "+91 98765 43210",
    }),
    expect.objectContaining({
      number: "124",
      dateOfBirth: "1980-12-31",
      age: "45",
      sex: "Male",
      phone: "098765 43210",
    }),
    expect.objectContaining({
      number: "125",
      dateOfBirth: "1980-12-31",
      age: "45",
      sex: "Female",
      phone: "98765-43210",
    }),
    expect.objectContaining({
      number: "126",
      dateOfBirth: "1980-12-31",
      age: "0",
      sex: "Male",
      phone: "9876543210",
    }),
    expect.objectContaining({ name: "बाळ", age: "0", sex: "Female" }),
    expect.objectContaining({ name: "मुलगा", age: "45", sex: "Male" }),
  ]);
});

test("reports every present value it cannot understand without dropping the row", () => {
  const result = parsePatientImportText(
    [
      "number,name,date of birth,age,sex,phone",
      "wrong,Asha,31/13/1980,131,unknown,9.87654E+09",
    ].join("\n"),
  );

  expect(result.rows).toEqual([
    {
      number: "",
      name: "Asha",
      dateOfBirth: "",
      age: "",
      sex: "",
      phone: "",
      sourceRow: 2,
    },
  ]);
  expect(result.problems).toEqual([
    {
      source: "Row 2",
      message: 'Patient number "wrong" was not understood, so it was left blank.',
    },
    {
      source: "Row 2",
      message: 'Age "131" was not understood, so it was left blank.',
    },
    {
      source: "Row 2",
      message:
        'Date of birth "31/13/1980" was not understood, so it was left blank.',
    },
    {
      source: "Row 2",
      message: 'Sex "unknown" was not understood, so it was left blank.',
    },
    {
      source: "Row 2",
      message:
        'Phone "9.87654E+09" was shortened by Excel, so it was left blank. Widen the column or format it as Text, then copy it again.',
    },
  ]);
});

test("keeps the first of two phone numbers and reports the omitted number", () => {
  for (const separator of ["/", ",", " or "]) {
    const result = parsePatientImportText(
      JSON.stringify([
        { name: "Asha", phone: `9876543210${separator}9123456789` },
      ]),
    );
    expect(result.rows[0].phone).toBe("9876543210");
    expect(result.problems).toEqual([
      {
        source: "Item 1",
        message: 'Phone "9123456789" was left out; "9876543210" was kept.',
      },
    ]);
  }
});

test("rejects impossible and future birth years", () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowText = [
    String(tomorrow.getDate()).padStart(2, "0"),
    String(tomorrow.getMonth() + 1).padStart(2, "0"),
    tomorrow.getFullYear(),
  ].join("/");
  const result = parsePatientImportText(
    JSON.stringify([
      { name: "Impossible", dob: "31/02/1980" },
      { name: "Future", dob: tomorrowText },
    ]),
  );
  expect(result.rows.map((row) => row.dateOfBirth)).toEqual(["", ""]);
  expect(result.problems).toHaveLength(2);
});

test("skips later duplicate Patient numbers and names both source rows", () => {
  const result = parsePatientImportText(
    "number,name\n00123,First\n\n#123,Second\n124,Third",
  );
  expect(result.rows.map((row) => row.name)).toEqual(["First", "Third"]);
  expect(result.rows.map((row) => row.sourceRow)).toEqual([2, 5]);
  expect(result.problems).toContainEqual({
    source: "Row 4",
    message:
      "Patient number 123 also appears in Row 2. Row 4 was skipped.",
  });
});

test("reports non-object JSON items instead of dropping them silently", () => {
  const result = parsePatientImportText('[null,"Asha",42]');
  expect(result.rows).toEqual([]);
  expect(result.problems).toEqual([
    {
      source: "Item 1",
      message: "Name is missing, so the item was skipped.",
    },
    {
      source: "Item 2",
      message: "Name is missing, so the item was skipped.",
    },
    {
      source: "Item 3",
      message: "Name is missing, so the item was skipped.",
    },
  ]);
});
