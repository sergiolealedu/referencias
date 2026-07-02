import { useId, useMemo } from 'react';

import { mergeOptions } from '../utils/flexibleOptions';

interface FlexibleSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  extraOptions?: readonly string[];
  placeholder?: string;
}

/** Campo com sugestões (datalist) que aceita qualquer valor digitado. */
export function FlexibleSelect({
  value,
  onChange,
  options,
  extraOptions,
  placeholder,
}: FlexibleSelectProps) {
  const listId = useId();
  const merged = useMemo(
    () => mergeOptions(options, value, extraOptions),
    [options, value, extraOptions],
  );

  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {merged.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}
