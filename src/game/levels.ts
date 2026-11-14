/** The site each level is staged on. Scenery builds one dressing set per theme. */
export type SiteTheme = "yard" | "warehouse" | "steel" | "tower" | "port" | "residential" | "windFarm";

export const SITE_THEME_LABEL: Record<SiteTheme, string> = {
  yard: "YARD",
  warehouse: "WAREHOUSE",
  steel: "STEEL YARD",
  tower: "HIGH-RISE",
  port: "DOCKS",
  residential: "BACKYARD",
  windFarm: "WIND FARM",
};
