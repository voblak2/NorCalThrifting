// Field.jsx — labeled input/textarea/select used by AuthModal, SubmitModal,
// SuggestStoreModal, and ApproveSuggestionModal.
export default function Field({ label, value, onChange, placeholder, type = 'text', multiline = false, onKeyDown, options }) {
  const Tag = multiline ? 'textarea' : 'input';
  const sharedStyle = {
    padding: "10px 12px", borderRadius: "10px",
    border: "1px solid #E8DCC8", background: "#FBF5EC",
    fontFamily: "inherit", fontSize: "14px", color: "#3D2E26",
    fontWeight: 400, resize: "vertical",
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600, color: "#6B5444" }}>
      {label}
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...sharedStyle, cursor: "pointer" }}>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <Tag type={type} value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={multiline ? 3 : undefined}
          style={sharedStyle}
        />
      )}
    </label>
  );
}
