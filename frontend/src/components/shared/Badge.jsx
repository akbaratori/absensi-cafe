import { getStatusBadgeClass } from '../../utils/formatters';

const Badge = ({ status, children, className = '' }) => {
  const badgeClass = getStatusBadgeClass(status);

  return (
    <span className={`badge ${badgeClass} ${className}`}>
      {children}
    </span>
  );
};

export default Badge;
