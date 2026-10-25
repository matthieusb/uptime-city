// Fills the view while the city is being built: a spinning refresh icon above the message.
export default function SplashScreen({ message }: { message: string }) {
  return (
    <div className="splash" role="status" data-testid="splash-screen">
      <svg
        className="splash-spinner"
        viewBox="0 0 24 24"
        width="64"
        height="64"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 12a8 8 0 0 0-14-5.3L4 9" />
        <path d="M4 4v5h5" />
        <path d="M4 12a8 8 0 0 0 14 5.3L20 15" />
        <path d="M20 20v-5h-5" />
      </svg>
      <h1 className="splash-title">{message}</h1>
    </div>
  )
}
