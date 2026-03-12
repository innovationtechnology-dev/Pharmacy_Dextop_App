import React, { useState, useEffect } from 'react';
import { FiX, FiMail, FiPhone, FiInfo, FiCheckCircle, FiChevronRight } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import { getStoredPharmacySettings } from '../types/pharmacy';

interface WelcomeNotificationProps {
    onClose: () => void;
}

const WelcomeNotification: React.FC<WelcomeNotificationProps> = ({ onClose }) => {
    const { theme } = useTheme();
    const [isVisible, setIsVisible] = useState(false);
    const [pharmacySettings] = useState(() => getStoredPharmacySettings());

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
                className={`fixed inset-0 flex items-center justify-center z-50 p-4 transition-all duration-500 ease-out ${isVisible
                    ? 'opacity-100 scale-100'
                    : 'opacity-0 scale-95 pointer-events-none'
                    }`}
            >
                <div
                    className="relative w-full max-w-[460px] transform transition-all duration-300"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Glowing aura effect behind the card */}
                    {theme === 'dark' && (
                        <div className="absolute -inset-1.5 bg-emerald-600/20 rounded-[2rem] blur-2xl opacity-60"></div>
                    )}

                    {/* Main card */}
                    <div className={`relative rounded-3xl overflow-hidden shadow-2xl transition-colors duration-300 ring-1 ${
                        theme === 'dark' 
                            ? 'bg-[#1a1f2e] ring-white/5 shadow-black/80' 
                            : 'bg-white ring-gray-200 shadow-emerald-900/5'
                    }`}>
                        {/* Top Gradient Border */}
                        <div className="h-1.5 w-full bg-emerald-600"></div>

                        <div className="p-6">
                            {/* Header */}
                            <div className="flex items-start justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className={`absolute -inset-1 rounded-2xl blur-md opacity-40 transition-colors bg-emerald-500`}></div>
                                        <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg bg-emerald-600 shadow-emerald-900/50`}>
                                            <FiCheckCircle className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <div className="pt-0.5">
                                        <h3 className={`text-xl font-bold tracking-tight flex items-center gap-2 ${
                                            theme === 'dark' ? 'text-white' : 'text-emerald-700'
                                        }`}>
                                            Welcome to {pharmacySettings.pharmacyName} ! <span className="inline-block animate-bounce origin-bottom">🎉</span>
                                        </h3>
                                        <p className={`text-[12px] font-medium mt-0.5 ${
                                            theme === 'dark' ? 'text-emerald-200/70' : 'text-gray-600/80'
                                        }`}>
                                            Pharmacy Management System
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className={`p-2 rounded-xl transition-all duration-300 transform hover:rotate-90 ${
                                        theme === 'dark'
                                            ? 'bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white'
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-700'
                                    }`}
                                    aria-label="Close notification"
                                >
                                    <FiX className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Main Content Area */}
                            <div className="space-y-2">
                                {/* Project Info */}
                                <div className={`relative overflow-hidden rounded-2xl p-2 border transition-all duration-300 ${
                                    theme === 'dark'
                                        ? 'bg-transparent border-transparent hover:border-slate-700 hover:bg-slate-800/10'
                                        : 'bg-transparent border-transparent hover:border-emerald-200 hover:bg-emerald-50/30'
                                }`}>
                                    {/* Large background icon */}
                                    <div className="absolute right-[-10px] top-1/2 -translate-y-1/2 pointer-events-none">
                                        <FiInfo className={`w-28 h-28 mr-2 ${theme === 'dark' ? 'text-white/[0.03]' : 'text-emerald-600/[0.05]'}`} />
                                    </div>
                                    <div className="relative z-10 flex items-start gap-3">
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            theme === 'dark' ? 'bg-[#2d374d] text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                                        }`}>
                                            <FiInfo className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 pt-0.5">
                                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
                                                theme === 'dark' ? 'text-white/80' : 'text-black/80'
                                            }`}>
                                                A Project Created By
                                            </p>
                                            <p className={`text-lg font-bold mb-1.5 ${
                                                theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'
                                            }`}>
                                                Innovation Technology
                                            </p>
                                            <p className={`text-[12.5px] leading-relaxed pr-2 ${
                                                theme === 'dark' ? 'text-white/70' : 'text-black/70'
                                            }`}>
                                                Empowering pharmacies with cutting-edge technology solutions
                                                for efficient management and seamless operations.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Contact Information */}
                                {/* Email */}
                                <button
                                    onClick={handleEmailClick}
                                    className={`group w-full flex items-center gap-3 p-2 rounded-lg border transition-all duration-300 text-left ${
                                        theme === 'dark'
                                            ? 'bg-transparent border-transparent hover:border-slate-700 hover:bg-slate-800/10'
                                            : 'bg-transparent border-transparent hover:border-emerald-200 hover:bg-emerald-50/20'
                                    }`}
                                >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                                        theme === 'dark' ? 'bg-[#2d374d] text-emerald-400 group-hover:bg-[#34405a]' : 'bg-emerald-600 text-white'
                                    }`}>
                                        <FiMail className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-[9px] font-bold uppercase tracking-widest ${
                                            theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                                        }`}>Email</p>
                                        <p className={`text-[13px] font-semibold leading-non mt-0.5 transition-colors ${
                                            theme === 'dark' ? 'text-gray-200 group-hover:text-white' : 'text-gray-800'
                                        }`}>
                                            innovationtechnology.dev@gmail.com
                                        </p>
                                    </div>
                                </button>

                                {/* Phone */}
                                <button
                                    onClick={handlePhoneClick}
                                    className={`group w-full flex items-center gap-3 p-2 rounded-lg border transition-all duration-300 text-left ${
                                        theme === 'dark'
                                            ? 'bg-transparent border-transparent hover:border-slate-700 hover:bg-slate-800/10'
                                            : 'bg-transparent border-transparent hover:border-emerald-200 hover:bg-emerald-50/20'
                                    }`}
                                >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                                        theme === 'dark' ? 'bg-[#2d374d] text-emerald-400 group-hover:bg-[#34405a]' : 'bg-emerald-600 text-white'
                                    }`}>
                                        <FiPhone className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-[9px] font-bold uppercase tracking-widest ${
                                            theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                                        }`}>Contact Number</p>
                                        <p className={`text-[14px] font-semibold leading-none mt-0.5 transition-colors ${
                                            theme === 'dark' ? 'text-gray-200 group-hover:text-white' : 'text-gray-800'
                                        }`}>
                                            (+92) 3205720-774
                                        </p>
                                    </div>
                                </button>

                                {/* WhatsApp */}
                                <button
                                    onClick={handleWhatsAppClick}
                                    className={`group w-full flex items-center gap-3 p-2 rounded-lg border transition-all duration-300 text-left ${
                                        theme === 'dark'
                                            ? 'bg-transparent border-transparent hover:border-slate-700 hover:bg-slate-800/10'
                                            : 'bg-transparent border-transparent hover:border-green-200 hover:bg-green-50/20'
                                    }`}
                                >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                                        theme === 'dark' ? 'bg-[#1e3b33] text-[#34d399] group-hover:bg-[#23453c]' : 'bg-green-600 text-white group-hover:bg-green-700'
                                    }`}>
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-[9px] font-bold uppercase tracking-widest ${
                                            theme === 'dark' ? 'text-slate-400' : 'text-gray-500'
                                        }`}>WhatsApp</p>
                                        <p className={`text-[14px] font-semibold leading-none mt-0.5 transition-colors ${
                                            theme === 'dark' ? 'text-gray-200 group-hover:text-white' : 'text-gray-800'
                                        }`}>
                                            Chat with us on WhatsApp
                                        </p>
                                    </div>
                                    <div>
                                        <FiChevronRight className={`w-4 h-4 transition-transform duration-300 group-hover:translate-x-1 ${
                                            theme === 'dark' ? 'text-slate-500 group-hover:text-white' : 'text-gray-400 group-hover:text-emerald-600'
                                        }`} />
                                    </div>
                                </button>
                            </div>

                            {/* Footer */}
                            <div className="mt-6 pt-5 border-t border-gray-100 flex flex-col items-center gap-2">
                                <p className={`text-[11px] font-semibold text-center ${
                                    theme === 'dark' ? 'text-emerald-400/80' : 'text-gray-500'
                                }`}>
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

