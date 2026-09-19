import notoSansRegularUrl from "@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url";
import notoSansBoldUrl from "@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url";

export { notoSansBoldUrl, notoSansRegularUrl };

export const prescriptionTextFontFace = `
  @font-face {
    font-family: "Prescription Noto Sans";
    src: url("${notoSansRegularUrl}") format("truetype");
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: "Prescription Noto Sans";
    src: url("${notoSansBoldUrl}") format("truetype");
    font-weight: 700;
    font-display: swap;
  }
`;
