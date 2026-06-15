interface Props {
  status: "connected" | "disconnected" | "pending" | "error";
}

export function StatusDot({ status }: Props) {
  return <span className={`status-dot ${status}`} />;
}
