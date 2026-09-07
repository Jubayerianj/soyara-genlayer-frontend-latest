import React, { useEffect, useRef } from 'react';

const RainEffect = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width, height;
    let drops = [];

    const init = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;

      // Adjust density based on screen size for performance
      const density = width < 768 ? 60 : 160;
      drops = [];
      for (let i = 0; i < density; i++) {
        drops.push({
          x: Math.random() * width,
          y: Math.random() * height,
          length: Math.random() * 25 + 15, /* Longer drops */
          speed: Math.random() * 12 + 8,  /* Faster speed */
          opacity: Math.random() * 0.4 + 0.2
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; /* More visible white */
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      
      ctx.beginPath();
      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x, drop.y + drop.length);

        drop.y += drop.speed;

        if (drop.y > height) {
          drop.y = -drop.length;
          drop.x = Math.random() * width;
        }
      }
      ctx.stroke();

      animationFrameId = requestAnimationFrame(draw);
    };

    const handleResize = () => {
      init();
    };

    window.addEventListener('resize', handleResize);
    init();
    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        opacity: 0.8
      }}
    />
  );
};

export default RainEffect;
