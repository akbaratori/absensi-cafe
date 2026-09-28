import { Loader2 } from 'lucide-react';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  ...props
}) => {
  const baseClasses = 'btn inline-flex items-center justify-center gap-2 font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  /**
   * `outline` adalah alias `secondary`.
   *
   * Beberapa halaman lama (ScheduleCalendar, modal, halaman approval) sudah
   * memakai `variant="outline"` padahal kelas `btn-outline` tidak pernah
   * didefinisikan di index.css — jadi tombolnya mewarisi `.btn` saja (tanpa
   * background/garis) dan tampak polos. Alias ini memperbaiki tampilannya
   * sekaligus menutup variasi nama yang tidak sengaja.
   */
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    outline: 'btn-secondary',
    danger: 'btn-danger',
    warning: 'btn-warning',
    ghost: 'btn-ghost',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

export default Button;
