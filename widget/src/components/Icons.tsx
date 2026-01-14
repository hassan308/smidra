import { MapPin, Clock, Heart, X, Search, ExternalLink, Maximize2, Minimize2, Map } from 'lucide-react';

export {
  MapPin,
  Clock,
  Heart,
  X,
  Search,
  ExternalLink,
  Maximize2,
  Minimize2,
  Map
};

export const Spinner = ({ className = '' }: { className?: string }) => (
  <div
    className={`border-2 border-current border-t-transparent rounded-full animate-spin ${className}`}
  />
);
