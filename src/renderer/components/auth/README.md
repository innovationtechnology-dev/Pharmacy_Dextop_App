# Authentication Components

Professional, beautiful login and signup components for the Pharmacy Management System.

## Components

### Login (`Login.tsx`)
A modern login component with email and password authentication.

**Features:**
- Email validation
- Password strength requirements
- Show/hide password toggle
- Remember me checkbox
- Loading states with spinner
- Error handling and validation
- Responsive design
- Beautiful gradient background

**Props:**
```typescript
interface LoginProps {
  onLogin?: (email: string) => void;
}
```

### Signup (`Signup.tsx`)
A comprehensive signup component with full form validation.

**Features:**
- Full name field
- Email validation
- Strong password requirements (uppercase, lowercase, number, min 8 chars)
- Password confirmation matching
- Terms and conditions checkbox
- Show/hide password toggles for both password fields
- Loading states with spinner
- Comprehensive error handling
- Responsive design

**Props:**
```typescript
interface SignupProps {
  onSignup?: (email: string, name: string) => void;
}
```

## Usage

### Basic Usage

```tsx
import { Login, Signup } from './components/auth';
import { Route } from 'react-router-dom';

// In your routes
<Route path="/login" element={<Login />} />
<Route path="/signup" element={<Signup />} />
```

### With Callbacks

```tsx
<Login 
  onLogin={(email) => {
    console.log('User logged in:', email);
    // Handle login logic
  }}
/>

<Signup
  onSignup={(email, name) => {
    console.log('User signed up:', email, name);
    // Handle signup logic
  }}
/>
```

## Styling

The components use **Tailwind CSS** utility classes for styling:
- Modern gradient backgrounds (`bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-400`)
- Glass-morphism card design (`backdrop-blur-lg bg-white/10`)
- Smooth animations and transitions
- Responsive design with Tailwind breakpoints
- Accessible form inputs with focus states

All styling is done through Tailwind utility classes directly in the components - no separate CSS files needed!

## Customization

### Colors
Modify Tailwind classes in the component files:
- Primary gradient: `from-indigo-500 via-purple-600 to-pink-400`
- Button gradient: `from-purple-600 to-indigo-600`
- Modify `bg-gradient-to-br` classes for different gradient directions

### Validation Rules
Modify validation logic in the component files:
- Login: Email format, password minimum length (6)
- Signup: Name length, email format, password strength (8+ chars, uppercase, lowercase, number)

## File Structure

```
src/renderer/components/auth/
├── Login.tsx          # Login component (Tailwind CSS)
├── Signup.tsx         # Signup component (Tailwind CSS)
├── index.ts           # Export file
└── README.md          # This file
```

## Integration with Backend

Replace the simulated API calls in `handleSubmit` functions with actual authentication logic:

```tsx
// Example: Replace in Login.tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!validateForm()) return;

  setLoading(true);
  try {
    // Replace with actual API call
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    
    if (!response.ok) throw new Error('Login failed');
    
    const data = await response.json();
    // Handle success (store token, redirect, etc.)
    navigate('/Home');
  } catch (error) {
    setErrors({ general: 'Invalid email or password' });
  } finally {
    setLoading(false);
  }
};
```

## Routes

Make sure to add these routes in `App.tsx`:
- `/login` - Login page
- `/signup` - Signup page

## Notes

- Components navigate to `/Home` on successful authentication
- Form validation happens on submit
- Errors clear automatically when user starts typing
- All inputs are disabled during loading states
- Components use React Router for navigation
- All styling uses Tailwind CSS utility classes
