import { useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { Spinner } from './Icons';

interface LoadingScreenProps {
  loadingText: string;
  waitingText: string;
}

export const LoadingScreen = memo(function LoadingScreen({
  loadingText,
  waitingText
}: LoadingScreenProps) {
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setPhase(2), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[400px] w-full flex flex-col items-center justify-center p-10"
    >
      <div className="relative mb-6">
        <div className="w-12 h-12 border-3 border-gray-200 dark:border-gray-700 border-t-[#C85A38] rounded-full animate-spin" />
      </div>

      <motion.p
        key={phase}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-lg font-medium text-gray-600 dark:text-gray-300 text-center"
      >
        {phase === 1 ? loadingText : waitingText}
      </motion.p>

      <div className="flex gap-1 mt-4">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-[#C85A38]"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2
            }}
          />
        ))}
      </div>
    </motion.div>
  );
});
