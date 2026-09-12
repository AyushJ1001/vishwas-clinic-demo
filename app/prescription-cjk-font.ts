import notoSansScRegularUrl from "@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf?url";

export { notoSansScRegularUrl };

export const prescriptionCjkFontFace = `
  @font-face {
    font-family: "Prescription Noto Sans SC";
    src: url("${notoSansScRegularUrl}") format("truetype");
    font-weight: 400 900;
    font-display: swap;
    unicode-range: U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF;
  }
`;
