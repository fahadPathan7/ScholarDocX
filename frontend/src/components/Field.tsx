import { ChangeEvent } from "react";

type FieldProps = {
  label: string;
  name: string;
  value: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<string | { value: string; label: string }>;
  rows?: number;
  onChange: (name: string, value: string) => void;
};

export function Field({
  label,
  name,
  value,
  type = "text",
  required,
  placeholder,
  options,
  rows,
  onChange
}: FieldProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    onChange(name, event.target.value);
  };

  return (
    <label className="field">
      <span>{label}</span>
      {options ? (
        <select name={name} value={value} required={required} onChange={handleChange}>
          <option value="">Select</option>
          {options.map((option) => (
            <option value={typeof option === "string" ? option : option.value} key={typeof option === "string" ? option : option.value}>
              {typeof option === "string" ? option : option.label}
            </option>
          ))}
        </select>
      ) : rows ? (
        <textarea
          name={name}
          value={value}
          required={required}
          placeholder={placeholder}
          rows={rows}
          onChange={handleChange}
        />
      ) : (
        <input
          name={name}
          value={value}
          type={type}
          required={required}
          placeholder={placeholder}
          onChange={handleChange}
        />
      )}
    </label>
  );
}
