// styles.js — small style helpers shared across the homepage and its modals.
export const btnStyle = (active, color, primary = false) => ({
  display: "flex", alignItems: "center", gap: "8px",
  padding: "0 20px", borderRadius: "12px", height: "52px",
  background: primary ? color : (active ? color : "#FBF5EC"),
  color: primary || active ? "#FFFCF6" : "#3D2E26",
  border: "1px solid #E8DCC8",
  fontSize: "15px", fontWeight: 600, fontFamily: "inherit",
  cursor: "pointer", transition: "all 0.2s",
  whiteSpace: "nowrap",
});

export const selectStyle = {
  padding: "8px 12px", borderRadius: "8px",
  border: "1px solid #E8DCC8", background: "#FBF5EC",
  fontFamily: "inherit", fontSize: "14px", color: "#3D2E26", cursor: "pointer",
};
