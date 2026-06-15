interface Props {
  size?: "sm" | "md" | "lg";
}

export function Spinner({ size = "md" }: Props) {
  const cls = ["spinner", size === "sm" ? "spinner-sm" : size === "lg" ? "spinner-lg" : ""].filter(Boolean).join(" ");
  return <span className={cls} />;
}
