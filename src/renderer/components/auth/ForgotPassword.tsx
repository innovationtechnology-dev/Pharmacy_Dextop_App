import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import pharmacist_1 from '../../public/images/pharmacist-1.jpg';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const validateEmail = (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email.trim()) {
            setError('Email is required');
            return;
        } else if (!validateEmail(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // Simulate API call
            await new Promise((resolve) => setTimeout(resolve, 1500));
            setIsSubmitted(true);
        } catch (err) {
            setError('An error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-screen overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-2 xs:p-3 sm:p-4 md:p-5 lg:p-6">
            {/* Main Container */}
            <div className="w-full max-w-[95%] xs:max-w-[92%] sm:max-w-[88%] md:max-w-[82%] lg:max-w-[78%] xl:max-w-[72%] 2xl:max-w-[68%] 3xl:max-w-[60%] 4k:max-w-[50%] 5k:max-w-[45%] bg-white shadow-lg sm:shadow-xl lg:shadow-2xl rounded-xl sm:rounded-2xl lg:rounded-3xl overflow-hidden">
                <div className="flex flex-col lg:flex-row h-full">
                    {/* Left Side - Form Section */}
                    <div className="w-full lg:w-1/2 flex items-center justify-center p-3 xs:p-4 sm:p-5 md:p-6 lg:p-8 xl:p-10 2xl:p-12 3xl:p-14 4k:p-16 5k:p-20">
                        <div className="w-full max-w-xs xs:max-w-sm sm:max-w-md md:max-w-lg lg:max-w-md xl:max-w-lg 2xl:max-w-xl 3xl:max-w-2xl 4k:max-w-3xl 5k:max-w-4xl">
                            {/* Header */}
                            <div className="text-center mb-3 xs:mb-4 sm:mb-5 md:mb-6 lg:mb-7 xl:mb-8">
                                <h2 className="text-lg xs:text-xl sm:text-2xl md:text-3xl lg:text-2xl xl:text-3xl 2xl:text-4xl 3xl:text-5xl 4k:text-6xl 5k:text-7xl font-bold text-emerald-700 mb-1 xs:mb-2 sm:mb-3">
                                    Forgot Password?
                                </h2>
                                <p className="text-gray-500 text-xs xs:text-sm sm:text-base md:text-lg lg:text-sm xl:text-base 2xl:text-lg 3xl:text-xl 4k:text-2xl 5k:text-3xl">
                                    Enter your email address to reset your password.
                                </p>
                            </div>

                            {/* Success Message */}
                            {isSubmitted ? (
                                <div className="text-center">
                                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm mb-6">
                                        If an account exists for <strong>{email}</strong>, you will receive a password reset link shortly.
                                    </div>
                                    <Link
                                        to="/login"
                                        className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-6 rounded-lg font-medium transition-all duration-200"
                                    >
                                        Back to Login
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    {/* Error Message */}
                                    {error && (
                                        <div className="bg-red-100 border border-red-400 text-red-700 px-2 xs:px-3 py-1 xs:py-2 rounded text-xs xs:text-sm sm:text-base mb-3">
                                            {error}
                                        </div>
                                    )}

                                    {/* Form */}
                                    <form
                                        className="space-y-3 xs:space-y-4 sm:space-y-5 md:space-y-6 text-black"
                                        onSubmit={handleSubmit}
                                    >
                                        {/* Email Field */}
                                        <div>
                                            <label className="block text-xs xs:text-sm sm:text-base md:text-lg lg:text-base xl:text-lg 2xl:text-xl 3xl:text-2xl 4k:text-3xl 5k:text-4xl font-medium text-gray-600 mb-1">
                                                Email Address
                                            </label>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => {
                                                    setEmail(e.target.value);
                                                    setError('');
                                                }}
                                                placeholder="Enter your email"
                                                className="w-full border border-gray-300 rounded-lg px-3 xs:px-4 py-2 xs:py-2.5 text-xs xs:text-sm sm:text-base md:text-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200"
                                            />
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
                                                    Sending...
                                                </span>
                                            ) : (
                                                'Send Reset Link'
                                            )}
                                        </button>

                                        {/* Back to Login Link */}
                                        <p className="text-center text-gray-600 text-xs xs:text-sm mt-2 xs:mt-3">
                                            Remember your password?{' '}
                                            <Link
                                                to="/login"
                                                className="text-emerald-600 font-medium hover:text-emerald-700 hover:underline transition-colors"
                                            >
                                                Back to Login
                                            </Link>
                                        </p>
                                    </form>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Side - Image Section */}
                    <div className="image-section hidden lg:flex w-full lg:w-1/2 bg-gradient-to-br from-emerald-50 to-teal-100 items-center justify-center p-1 order-2 lg:order-1">
                        <div className="relative w-full h-full min-h-[200px] xs:min-h-[250px] sm:min-h-[300px] md:min-h-[350px] lg:min-h-full rounded-lg overflow-hidden">
                            <img
                                src={pharmacist_1}
                                alt="Pharmacist professional"
                                className="w-full h-full object-cover object-center"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
