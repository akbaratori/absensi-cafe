# Attendance System - Frontend

Modern React frontend for the employee attendance system.

## Tech Stack

- **React 18** - Functional components with hooks
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router 6** - Client-side routing
- **Axios** - HTTP client with interceptors
- **React Hot Toast** - Toast notifications
- **date-fns** - Date formatting

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── shared/           # Reusable components (Button, Input, Card, etc.)
│   │   ├── layout/           # Layout components (Sidebar, TopBar)
│   │   ├── employee/         # Employee-specific components
│   │   └── admin/            # Admin-specific components
│   ├── pages/
│   │   ├── auth/             # Login page
│   │   ├── employee/         # Employee pages (dashboard, attendance)
│   │   └── admin/            # Admin pages (users, reports)
│   ├── services/             # API service layer
│   │   ├── api.js            # Axios instance with interceptors
│   │   ├── authService.js    # Auth API calls
│   │   ├── attendanceService.js  # Attendance API calls
│   │   └── adminService.js   # Admin API calls
│   ├── contexts/             # React contexts
│   │   └── AuthContext.jsx   # Authentication state
│   ├── hooks/                # Custom hooks
│   │   ├── useAsync.js       # Async state management
│   │   └── useToast.js       # Toast notifications
│   ├── utils/                # Utility functions
│   │   ├── formatters.js     # Date/time/status formatters
│   │   └── validation.js     # Input validation
│   ├── App.jsx               # Root component with routing
│   ├── main.jsx              # Entry point
│   └── index.css             # Global styles + Tailwind
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.js
└── README.md
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Environment Configuration

Create a `.env` file if needed (development proxy is configured in vite.config.js):

```env
VITE_API_URL=http://localhost:3001
```

### 3. Start Development Server

```bash
npm run dev
```

Frontend will start on `http://localhost:3000`

### 4. Build for Production

```bash
npm run build
```

Output will be in `dist/` directory.

## Key Features

### Authentication Flow

1. User logs in → Token stored in localStorage
2. Axios interceptor adds token to all requests
3. 401 responses trigger token refresh
4. Refresh fails → Redirect to login

### State Management

- **AuthContext** - Global auth state (user, token, login/logout)
- **useState** - Local component state
- **Custom hooks** - Reusable async logic (useAsync, useFetch)

### Styling Approach

- **Tailwind CSS** - Utility classes for styling
- **Component classes** - `.btn`, `.input`, `.card` in `index.css`
- **Responsive design** - Mobile-first with breakpoints (sm, md, lg, xl)

### Error Handling

- Global axios interceptor for API errors
- Toast notifications for user feedback
- Inline validation errors for forms
- Skeleton screens during loading

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

## Component Examples

### Button Component

```jsx
import Button from '@/components/shared/Button';

<Button
  variant="primary"
  size="lg"
  loading={isLoading}
  onClick={handleClick}
>
  Save Changes
</Button>
```

### API Call Pattern

```jsx
import { useState } from 'react';
import { clockIn } from '@/services/attendanceService';
import { showSuccess, showError } from '@/hooks/useToast';

const MyComponent = () => {
  const [loading, setLoading] = useState(false);

  const handleClockIn = async () => {
    setLoading(true);
    try {
      await clockIn({ location: { lat: 0, lng: 0 } });
      showSuccess('Clocked in successfully!');
    } catch (error) {
      showError(error.response?.data?.error?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return <button onClick={handleClockIn} disabled={loading}>Clock In</button>;
};
```

## Responsive Behavior

- **Mobile** (< 640px): Stacked layout, bottom navigation
- **Tablet** (640px - 1024px): Collapsible sidebar
- **Desktop** (> 1024px): Full sidebar, multi-column layouts

## Browser Support

- Chrome (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- Edge (last 2 versions)

## License

MIT
