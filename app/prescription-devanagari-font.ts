import notoSansDevanagariRegularUrl from "@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf?url";

export { notoSansDevanagariRegularUrl };

export const prescriptionDevanagariFontFace = `
  @font-face {
    font-family: "Prescription Noto Sans Devanagari";
    src: url("${notoSansDevanagariRegularUrl}") format("truetype");
    font-weight: 400 900;
    font-display: swap;
    unicode-range: U+0900-097F;
  }
`;
