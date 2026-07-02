interface DomainSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}

/** Lista fixa do domínio; inclui valor legado se ainda não estiver no domínio. */
export function DomainSelect({ value, onChange, options }: DomainSelectProps) {
  const domain = [...options];
  const legacyValue = value.trim();
  const showLegacy =
    legacyValue.length > 0 && !domain.includes(legacyValue);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {domain.map((option) => (
        <option key={`domain-${option}`} value={option}>{option}</option>
      ))}
      {showLegacy && (
        <option key={`legacy-${legacyValue}`} value={legacyValue}>
          {legacyValue}
        </option>
      )}
    </select>
  );
}
