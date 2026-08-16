// Field.jsx — labeled input/textarea used by AuthModal and SubmitModal.
export default function Field({ label, value, onChange, placeholder, type = 'text', multiline = false, onKeyDown }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600, color: "#6B5444" }}>
      {label}
      <Tag type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={multiline ? 3 : undefined}
        style={{
          padding: "10px 12px", borderRadius: "10px",
          border: "1px solid #E8DCC8", background: "#FBF5EC",
          fontFamily: "inherit", fontSize: "14px", color: "#3D2E26",
          fontWeight: 400, resize: "vertical",
        }}
      />
    </label>
  );
}
