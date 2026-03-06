import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signup } from '../../utils/auth';

import pharmacist_2 from '../../public/images/pharmacist-2.jpg';

interface SignupProps {
  onSignup?: (email: string, name: string) => void;
}

const Signup: React.FC<SignupProps> = ({ onSignup }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'cashier', // Default to cashier for safety
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ✅ Validate Form Inputs
  const validateForm = () => {
    const newErrors: typeof errors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password =
        'Password must contain uppercase, lowercase, and number';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ✅ Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const result = await signup(
        formData.name,
        formData.email,
        formData.password,
        formData.role
      );

      if (result.success) {
        if (onSignup) onSignup(formData.email, formData.name);
        navigate('/dashboard');
      } else {
        setErrors({
          general: result.error || 'Registration failed. Please try again.',
        });
      }
    } catch {
      setErrors({
        general: 'An error occurred during registration. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Handle Input Changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear field-specific error when typing
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 xs:px-5 sm:px-6 md:px-8 lg:px-10 py-20 xs:py-24 sm:py-28 md:py-32 lg:py-36">
      {/* Main Container */}
      <div className="w-full max-w-[95%] xs:max-w-[92%] sm:max-w-[88%] md:max-w-[82%] lg:max-w-[78%] xl:max-w-[72%] 2xl:max-w-[68%] 3xl:max-w-[60%] 4k:max-w-[50%] 5k:max-w-[45%] bg-white shadow-lg sm:shadow-xl lg:shadow-2xl rounded-xl sm:rounded-2xl lg:rounded-3xl overflow-hidden">
        <div className="flex flex-col lg:flex-row h-full">
          {/* Left Side - Image Section */}
          <div className="image-section hidden lg:flex w-full lg:w-1/2 bg-gradient-to-br from-emerald-50 to-teal-100 items-center justify-center p-1 order-2 lg:order-1">
            <div className="relative w-full h-full min-h-[200px] xs:min-h-[250px] sm:min-h-[300px] md:min-h-[350px] lg:min-h-[400px] rounded-lg overflow-hidden">
              <img
                src={pharmacist_2}
                alt="Pharmacist professional"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent"></div>
            </div>
          </div>

          {/* Right Side - Form Section */}
          <div className="w-full lg:w-1/2 flex items-center justify-center p-2 xs:p-3 sm:p-4 md:p-5 lg:p-6 order-1 lg:order-2">
            <div className="w-full max-w-xs xs:max-w-sm sm:max-w-md md:max-w-lg lg:max-w-md xl:max-w-lg 2xl:max-w-xl 3xl:max-w-2xl 4k:max-w-3xl 5k:max-w-4xl">
              {/* Header */}
              <div className="text-center mb-3 xs:mb-4 sm:mb-5 md:mb-6 lg:mb-7 xl:mb-8">
                <h2 className="text-lg xs:text-xl sm:text-2xl md:text-3xl lg:text-2xl xl:text-3xl 2xl:text-4xl 3xl:text-5xl 4k:text-6xl 5k:text-7xl font-bold text-emerald-700 mb-1 xs:mb-2 sm:mb-3">
                  Create an account
                </h2>
                <p className="text-gray-500 text-xs xs:text-sm sm:text-base md:text-lg lg:text-sm xl:text-base 2xl:text-lg 3xl:text-xl 4k:text-2xl 5k:text-3xl">
                  Create an account to manage pharmacy operations</p>
              </div>

              {/* Error Message */}
              {errors.general && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-2 xs:px-3 py-1 xs:py-2 rounded text-xs xs:text-sm sm:text-base mb-3">
                  {errors.general}
                </div>
              )}

              {/* Form */}
              <form
                className="space-y-3 xs:space-y-4 sm:space-y-4 md:space-y-4 text-black"
                onSubmit={handleSubmit}
              >
                {/* Name Field */}
                <div>
                  <label className="block text-xs xs:text-sm sm:text-base md:text-lg lg:text-base xl:text-lg 2xl:text-xl 3xl:text-2xl 4k:text-3xl 5k:text-4xl font-medium text-gray-600 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter your name"
                    disabled={isLoading}
                    className="w-full border border-gray-300 rounded-lg px-3 xs:px-4 py-2 xs:py-2.5 text-xs xs:text-sm sm:text-base md:text-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {errors.name && (
                    <p className="text-red-600 text-xs xs:text-sm mt-1">
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* Email Field */}
                <div>
                  <label className="block text-xs xs:text-sm sm:text-base md:text-lg lg:text-base xl:text-lg 2xl:text-xl 3xl:text-2xl 4k:text-3xl 5k:text-4xl font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    disabled={isLoading}
                    className="w-full border border-gray-300 rounded-lg px-3 xs:px-4 py-2 xs:py-2.5 text-xs xs:text-sm sm:text-base md:text-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {errors.email && (
                    <p className="text-red-600 text-xs xs:text-sm mt-1">
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-xs xs:text-sm sm:text-base md:text-lg lg:text-base xl:text-lg 2xl:text-xl 3xl:text-2xl 4k:text-3xl 5k:text-4xl font-medium text-gray-600 mb-1">
                    Select Role
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value="admin"
                        checked={formData.role === 'admin'}
                        onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Admin</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value="cashier"
                        checked={formData.role === 'cashier'}
                        onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Cashier</span>
                    </label>
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-xs xs:text-sm sm:text-base md:text-lg lg:text-base xl:text-lg 2xl:text-xl 3xl:text-2xl 4k:text-3xl 5k:text-4xl font-medium text-gray-600 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Create a password"
                      disabled={isLoading}
                      className="w-full border border-gray-300 rounded-lg px-3 xs:px-4 py-2 xs:py-2.5 text-xs xs:text-sm sm:text-base md:text-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed pr-10 xs:pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                      className="absolute right-2 xs:right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm xs:text-base hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-red-600 text-xs xs:text-sm mt-1">
                      {errors.password}
                    </p>
                  )}
                </div>

                {/* Confirm Password Field */}
                <div>
                  <label className="block text-xs xs:text-sm sm:text-base md:text-lg lg:text-base xl:text-lg 2xl:text-xl 3xl:text-2xl 4k:text-3xl 5k:text-4xl font-medium text-gray-600 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Confirm your password"
                      disabled={isLoading}
                      className="w-full border border-gray-300 rounded-lg px-3 xs:px-4 py-2 xs:py-2.5 text-xs xs:text-sm sm:text-base md:text-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed pr-10 xs:pr-12"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      disabled={isLoading}
                      className="absolute right-2 xs:right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm xs:text-base hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {showConfirmPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-red-600 text-xs xs:text-sm mt-1">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>

                {/* Terms and Conditions */}
                <div>
                  <label className="flex items-start cursor-pointer group">
                    <input
                      type="checkbox"
                      disabled={isLoading}
                      className="h-3 xs:h-4 w-3 xs:w-4 border-gray-300 rounded transition-all mt-0.5 disabled:opacity-50 disabled:cursor-not-allowed accent-emerald-600"
                    />
                    <span className="ml-1 xs:ml-2 text-gray-700 text-xs xs:text-sm group-hover:text-gray-900 transition-colors">
                      I agree to the{' '}
                      <Link
                        to="/terms"
                        className="text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                      >
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link
                        to="/privacy"
                        className="text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                      >
                        Privacy Policy
                      </Link>
                    </span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 xs:py-2.5 rounded-lg font-medium text-xs xs:text-sm sm:text-base md:text-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow hover:shadow-md"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-3 w-3 xs:h-4 xs:w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Creating account...
                    </span>
                  ) : (
                    'Create Account'
                  )}
                </button>

                {/* Login Link */}
                <p className="text-center text-gray-600 text-xs xs:text-sm mt-2 xs:mt-3">
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    className="text-emerald-600 font-medium hover:text-emerald-700 hover:underline transition-colors"
                  >
                    Login
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
