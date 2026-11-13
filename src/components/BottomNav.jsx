export default function BottomNav({ page, onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="Main sections">
      <button
        type="button"
        className={page === 'trip' ? 'nav-btn active' : 'nav-btn'}
        aria-current={page === 'trip' ? 'page' : undefined}
        onClick={() => onNavigate('trip')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.7 4.5 5.5v2.1c0 5 3.2 9.3 7.5 10.9 4.3-1.6 7.5-5.9 7.5-10.9V5.5L12 2.7zm-1.2 13.9-3.2-3.2 1.4-1.4 1.8 1.8 4-4 1.4 1.4-5.4 5.4z" />
        </svg>
        <span>Trip cost</span>
      </button>
      <button
        type="button"
        className={page === 'mileage' ? 'nav-btn active' : 'nav-btn'}
        aria-current={page === 'mileage' ? 'page' : undefined}
        onClick={() => onNavigate('mileage')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20V10h3v10H4zm6.5 0V4h3v16h-3zM17 20v-7h3v7h-3z" />
        </svg>
        <span>My mileage</span>
      </button>
    </nav>
  )
}
