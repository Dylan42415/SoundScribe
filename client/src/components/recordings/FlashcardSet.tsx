import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RotateCw, Shuffle } from "lucide-react";

interface Flashcard {
  title: string;
  explanation: string;
}

interface FlashcardSetProps {
  cards: Flashcard[];
}

export function FlashcardSet({ cards: initialCards }: FlashcardSetProps) {
  const [cards, setCards] = useState(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (!cards.length) return null;

  const handleNext = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % cards.length);
    }, isFlipped ? 150 : 0);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
    }, isFlipped ? 150 : 0);
  };

  const handleShuffle = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const currentCard = cards[currentIndex];

  return (
    <div className="flex flex-col items-center gap-6 py-4 w-full max-w-xl mx-auto">
      {/* Progress & Controls */}
      <div className="flex items-center justify-between w-full px-2">
        <div className="text-sm font-medium text-muted-foreground">
          Card {currentIndex + 1} of {cards.length}
        </div>
        <Button variant="ghost" size="sm" onClick={handleShuffle} className="text-xs h-8">
          <Shuffle className="w-3 h-3 mr-2" /> Shuffle
        </Button>
      </div>

      {/* Flashcard Container */}
      <div 
        className="relative w-full aspect-[16/10] perspective-1000 cursor-pointer group"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div className={`relative w-full h-full transition-transform duration-500 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
          
          {/* Front Side */}
          <Card className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center backface-hidden border-2 border-primary/20 shadow-xl bg-card">
            <div className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest text-primary/40">Front</div>
            <h2 className="text-2xl font-bold font-heading text-primary leading-tight">
              {currentCard.title}
            </h2>
            <p className="mt-4 text-sm text-muted-foreground animate-pulse">
              Click to reveal definition
            </p>
          </Card>

          {/* Back Side */}
          <Card className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center backface-hidden rotate-y-180 border-2 border-secondary/20 shadow-xl bg-secondary/5 overflow-y-auto">
             <div className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-widest text-secondary/60">Back</div>
             <div className="max-w-md">
               <p className="text-lg text-foreground leading-relaxed whitespace-pre-wrap">
                 {currentCard.explanation}
               </p>
             </div>
          </Card>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="icon" 
          className="rounded-full h-12 w-12"
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <Button 
          variant="secondary" 
          className="px-8 rounded-full h-12 font-semibold"
          onClick={(e) => { e.stopPropagation(); setIsFlipped(!isFlipped); }}
        >
          <RotateCw className="w-4 h-4 mr-2" />
          Flip Card
        </Button>

        <Button 
          variant="outline" 
          size="icon" 
          className="rounded-full h-12 w-12"
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
        >
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
