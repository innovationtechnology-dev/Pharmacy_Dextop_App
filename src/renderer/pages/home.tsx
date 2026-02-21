import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="relative w-full h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-400 bg-[length:400%_400%] animate-gradient-shift transition-all duration-700">
      {/* Animated background orbs */}
      <div className="absolute w-full h-full overflow-hidden z-0">
        <div className="absolute w-96 h-96 rounded-full blur-3xl opacity-60 bg-gradient-to-br from-indigo-500 to-purple-600 -top-24 -left-24 animate-float" style={{ animationDelay: '0s' }}></div>
        <div className="absolute w-[500px] h-[500px] rounded-full blur-3xl opacity-60 bg-gradient-to-br from-pink-400 to-red-500 -bottom-36 -right-36 animate-float" style={{ animationDelay: '-5s' }}></div>
        <div className="absolute w-[350px] h-[350px] rounded-full blur-3xl opacity-60 bg-gradient-to-br from-blue-400 to-cyan-400 top-1/2 left-[10%] animate-float" style={{ animationDelay: '-10s' }}></div>
        <div className="absolute w-72 h-72 rounded-full blur-3xl opacity-60 bg-gradient-to-br from-green-400 to-teal-400 bottom-[20%] right-[20%] animate-float" style={{ animationDelay: '-15s' }}></div>
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-8 max-w-4xl w-full animate-fade-in-up">
        <div className="mb-16">
          <h1 className="text-7xl md:text-8xl font-extrabold m-0 p-0 leading-tight text-white drop-shadow-lg animate-title-reveal">
            <span className="block animate-slide-in-left" style={{ animationDelay: '0.6s' }}>Pharmacy</span>
            <span className="block animate-slide-in-left" style={{ animationDelay: '0.8s' }}>Management</span>
            <span className="block bg-gradient-to-br from-white to-gray-300 bg-clip-text text-transparent animate-slide-in-left" style={{ animationDelay: '1s' }}>System</span>
          </h1>
          <p className="text-2xl md:text-3xl text-white/95 mt-6 font-light tracking-wide drop-shadow-sm animate-fade-in" style={{ animationDelay: '1.2s' }}>
            Streamline your pharmacy operations with our comprehensive management solution
          </p>
        </div>

        <div className="flex gap-8 justify-center items-center flex-wrap animate-fade-in-up" style={{ animationDelay: '1.5s' }}>
          <button
            type="button"
            className="relative px-12 py-5 text-xl font-semibold border-none rounded-full cursor-pointer overflow-hidden transition-all duration-300 shadow-lg uppercase tracking-wider flex items-center gap-2 min-w-[180px] justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-2 border-white/30 hover:-translate-y-1 hover:scale-105 hover:shadow-2xl active:translate-y-0 active:scale-[1.02] before:absolute before:top-0 before:-left-full before:w-full before:h-full before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:transition-all before:duration-500 hover:before:left-full"
            onClick={() => navigate('/login')}
          >
            <span className="relative z-10">Login</span>
            <span className="relative z-10 text-2xl transition-transform duration-300 hover:translate-x-1">→</span>
          </button>
        </div>

        {/* Floating decorative circles */}
        <div className="absolute w-full h-full top-0 left-0 z-0 pointer-events-none">
          <div className="absolute w-24 h-24 rounded-full bg-white/10 border border-white/20 backdrop-blur-md animate-float-circle top-[20%] left-[10%]" style={{ animationDelay: '0s' }}></div>
          <div className="absolute w-16 h-16 rounded-full bg-white/10 border border-white/20 backdrop-blur-md animate-float-circle top-[60%] right-[15%]" style={{ animationDelay: '-5s' }}></div>
          <div className="absolute w-20 h-20 rounded-full bg-white/10 border border-white/20 backdrop-blur-md animate-float-circle bottom-[20%] left-[20%]" style={{ animationDelay: '-10s' }}></div>
        </div>
      </div>
    </div>
  );
};

export default Home;
