const Card = ({ children, className = '', onClick }) => {
  const baseClasses = 'card';
  const clickableClasses = onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : '';

  return (
    <div
      className={`${baseClasses} ${clickableClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

const CardHeader = ({ children, className = '' }) => {
  return <div className={`card-header ${className}`}>{children}</div>;
};

const CardBody = ({ children, className = '' }) => {
  return <div className={`card-body ${className}`}>{children}</div>;
};

const CardFooter = ({ children, className = '' }) => {
  return <div className={`px-6 py-4 border-t border-gray-200 dark:border-gray-700 ${className}`}>{children}</div>;
};

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
