import React, { useEffect, useState } from "react";
import { motion } from "motion/react";

interface Piece {
  id: string;
  type: "burst-left" | "burst-right" | "rain";
  color: string;
  size: number;
  shape: "circle" | "square" | "triangle" | "bar";
  delay: number;
  duration: number;
  speedY: number;
  swayRange: number;
  rotateSpeed: number;
  // Burst-specific Physics
  angle: number;
  velocity: number;
}

const PALETTE = [
  "#3B82F6", // Blue
  "#EF4444", // Red
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#8B5CF6", // Violet
  "#06B6D4", // Cyan
  "#F43F5E", // Rose
  "#EAB308", // Yellow
];

function generateConfetti(count = 120): Piece[] {
  const pieces: Piece[] = [];

  for (let i = 0; i < count; i++) {
    const id = `confetti-${i}-${Math.random()}`;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const size = Math.floor(Math.random() * 10) + 6; // 6px to 16px
    const shapes: ("circle" | "square" | "triangle" | "bar")[] = ["circle", "square", "triangle", "bar"];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    
    // Distribute roles: 30% left burst, 30% right burst, 40% rain
    const roll = Math.random();
    let type: "burst-left" | "burst-right" | "rain";
    if (roll < 0.3) {
      type = "burst-left";
    } else if (roll < 0.6) {
      type = "burst-right";
    } else {
      type = "rain";
    }

    const delay = Math.random() * 0.5; // Up to 0.5s delay
    const duration = Math.random() * 2 + 2.5; // 2.5s to 4.5s
    const speedY = Math.random() * 150 + 100;
    const swayRange = Math.random() * 40 + 20;
    const rotateSpeed = Math.random() * 720 - 360; // Degrees of twist

    // Angle in radians
    let angle = 0;
    if (type === "burst-left") {
      // Shoot up & right: 15 to 70 degrees
      angle = (Math.random() * 55 + 15) * (Math.PI / 180);
    } else if (type === "burst-right") {
      // Shoot up & left: 110 to 165 degrees
      angle = (Math.random() * 55 + 110) * (Math.PI / 180);
    }
    const velocity = Math.random() * 25 + 15; // Initial burst push

    pieces.push({
      id,
      type,
      color,
      size,
      shape,
      delay,
      duration,
      speedY,
      swayRange,
      rotateSpeed,
      angle,
      velocity,
    });
  }

  return pieces;
}

function CelebrationConfetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    // Generate initial batch on mount
    setPieces(generateConfetti(140));

    // Optional: Auto-unmount/prune old particles or generate another small burst later
    const timer = setTimeout(() => {
      // Keep things light
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((piece) => {
        // Build rendering custom clip-paths or borders for different shapes
        let shapeStyle: React.CSSProperties = {
          backgroundColor: piece.color,
          width: `${piece.size}px`,
          height: piece.shape === "bar" ? `${piece.size * 2.5}px` : `${piece.size}px`,
        };

        if (piece.shape === "circle") {
          shapeStyle.borderRadius = "50%";
        } else if (piece.shape === "triangle") {
          shapeStyle.backgroundColor = "transparent";
          shapeStyle.width = "0";
          shapeStyle.height = "0";
          shapeStyle.borderLeft = `${piece.size / 2}px solid transparent`;
          shapeStyle.borderRight = `${piece.size / 2}px solid transparent`;
          shapeStyle.borderBottom = `${piece.size}px solid ${piece.color}`;
        } else if (piece.shape === "square") {
          shapeStyle.borderRadius = "2px";
        } else {
          // Bar shape
          shapeStyle.borderRadius = "1px";
        }

        // Custom Framer Motion setup based on role
        if (piece.type === "rain") {
          // Falls from top scattered to bottom, swaying left and right
          const startX = `${Math.random() * 100}vw`;
          const endXOffset = (Math.random() - 0.5) * 200; // float up to 100px left/right
          
          return (
            <motion.div
              key={piece.id}
              style={{
                position: "absolute",
                top: "-5%",
                left: startX,
                ...shapeStyle,
              }}
              initial={{ opacity: 0, y: -20, rotate: 0 }}
              animate={{
                opacity: [0, 1, 1, 0.8, 0],
                // Sway horizontal using array keyframes
                x: [0, endXOffset / 2, endXOffset, endXOffset * 1.2],
                y: "110vh",
                rotate: piece.rotateSpeed,
              }}
              transition={{
                delay: piece.delay,
                duration: piece.duration,
                ease: "easeOut",
              }}
            />
          );
        } else {
          // Burst-left starts bottom-left, Burst-right starts bottom-right
          const startX = piece.type === "burst-left" ? "0vw" : "100vw";
          const startY = "100vh";

          // Calculate trajectory offsets
          // x changes by velocity * cos(angle)
          // y changes by velocity * sin(angle) (going upwards, so negative)
          // plus we add gravity pull towards the end
          const destX = Math.cos(piece.angle) * piece.velocity * 30; // Scale travel
          const destY = -Math.sin(piece.angle) * piece.velocity * 25; // Scale height
          
          return (
            <motion.div
              key={piece.id}
              style={{
                position: "absolute",
                left: startX,
                top: startY,
                ...shapeStyle,
              }}
              initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 1, 1, 0.7, 0],
                scale: [0, 1.2, 1, 0.8, 0.5],
                // Follow trajectory path
                x: [
                  0,
                  destX * 0.3,
                  destX * 0.6,
                  destX * 0.9,
                  destX + (piece.type === "burst-left" ? 50 : -50), // drift at the end
                ],
                y: [
                  0,
                  destY * 0.4,
                  destY * 1.1, // highest point
                  destY * 0.8 + 150, // falling down (gravity effect)
                  destY * 0.5 + 400, // plunging further
                ],
                rotate: piece.rotateSpeed * 1.5,
              }}
              transition={{
                delay: piece.delay * 0.4, // faster spontaneous response
                duration: piece.duration * 0.8, // snappier burst
                ease: "circOut",
              }}
            />
          );
        }
      })}
    </div>
  );
}

export default React.memo(CelebrationConfetti);
