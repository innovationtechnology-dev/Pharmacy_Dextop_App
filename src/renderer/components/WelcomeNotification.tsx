import React, { useState, useEffect } from 'react';
import { FiX, FiMail, FiPhone, FiInfo, FiCheckCircle } from 'react-icons/fi';

interface WelcomeNotificationProps {
    onClose: () => void;
}

const WelcomeNotification: React.FC<WelcomeNotificationProps> = ({ onClose }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Animate in after component mounts
        const timer = setTimeout(() => setIsVisible(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => {
            onClose();
        }, 300); // Wait for animation to complete
    };

    const handleWhatsAppClick = () => {
        const phoneNumber = '923205720774'; // +92 3205720774
        const message = encodeURIComponent('Hello! I have a question about the Pharmacy Management System.');
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
        window.open(whatsappUrl, '_blank');
    };

    const handleEmailClick = () => {
        window.location.href = 'mailto:innovationtechnology.dev@gmail.com';
    };

    const handlePhoneClick = () => {
        window.location.href = 'tel:+923205720774';
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                onClick={handleClose}
            />

            {/* Centered Notification */}
            <div
                className={`fixed inset-0 flex items-center justify-center z-50 p-4 transition-all duration-300 ease-out ${isVisible
                    ? 'opacity-100 scale-100'
                    : 'opacity-0 scale-95 pointer-events-none'
                    }`}
            >
                <div
                    className="relative w-full max-w-lg transform transition-all duration-300"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Main card */}
                    <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
                        {/* Header bar */}
                        <div className="h-2 bg-emerald-600"></div>

                        <div className="p-8">
                            {/* Header with close button */}
                            <div className="flex items-start justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                                        {/* @ts-ignore - react-icons type issue */}
                                        <FiCheckCircle className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-emerald-700">
                                            Welcome to Dashboard! 🎉
                                        </h3>
                                        <p className="text-sm text-gray-600 mt-1 font-medium">
                                            Your pharmacy management system
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="p-2.5 hover:bg-gray-100/80 rounded-xl transition-all duration-200 text-gray-400 hover:text-gray-700 hover:rotate-90 transform"
                                    aria-label="Close notification"
                                >
                                    {/* @ts-ignore - react-icons type issue */}
                                    <FiX className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Company Information */}
                            <div className="space-y-5">
                                {/* Project Info */}
                                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 bg-emerald-50 rounded-xl">
                                            {/* @ts-ignore - react-icons type issue */}
                                            <FiInfo className="w-6 h-6 text-emerald-600" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-gray-700 mb-2">
                                                A Project Created By
                                            </p>
                                            <p className="text-2xl font-bold text-emerald-700 mb-3">
                                                Innovation Technology
                                            </p>
                                            <p className="text-sm text-gray-600 leading-relaxed">
                                                Empowering pharmacies with cutting-edge technology solutions
                                                for efficient management and seamless operations.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Contact Information */}
                                <div className="space-y-3">
                                    {/* Email */}
                                    <button
                                        onClick={handleEmailClick}
                                        className="group w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-emerald-300 hover:shadow-lg transition-all duration-300"
                                    >
                                        <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-md group-hover:bg-emerald-700 transition-colors duration-300">
                                            {/* @ts-ignore - react-icons type issue */}
                                            <FiMail className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
                                            <p className="text-base font-bold text-gray-800 group-hover:text-emerald-600 transition-colors">
                                                innovationtechnology.dev@gmail.com
                                            </p>
                                        </div>
                                    </button>

                                    {/* Phone */}
                                    <button
                                        onClick={handlePhoneClick}
                                        className="group w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-emerald-300 hover:shadow-lg transition-all duration-300"
                                    >
                                        <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-md group-hover:bg-emerald-700 transition-colors duration-300">
                                            {/* @ts-ignore - react-icons type issue */}
                                            <FiPhone className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contact Number</p>
                                            <p className="text-base font-bold text-gray-800 group-hover:text-emerald-600 transition-colors">
                                                (+92) 3205720-774
                                            </p>
                                        </div>
                                    </button>

                                    {/* WhatsApp */}
                                    <button
                                        onClick={handleWhatsAppClick}
                                        className="group w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-green-500 hover:shadow-lg transition-all duration-300"
                                    >
                                        <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center shadow-md group-hover:bg-green-700 transition-colors duration-300">
                                            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">WhatsApp</p>
                                            <p className="text-base font-bold text-gray-800 group-hover:text-green-600 transition-colors">
                                                Chat with us on WhatsApp
                                            </p>
                                        </div>
                                        <div>
                                            <svg className="w-5 h-5 text-gray-400 group-hover:text-green-600 group-hover:translate-x-1 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="mt-6 pt-6 border-t border-gray-200">
                                <p className="text-xs text-center text-gray-500 font-medium">
                                    Thank you for choosing our pharmacy management system ✨
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default WelcomeNotification;

