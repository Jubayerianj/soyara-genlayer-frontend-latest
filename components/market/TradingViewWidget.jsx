import React, { useEffect, useRef, useState } from 'react';

const TradingViewWidget = ({ symbol = 'BINANCE:ETHUSDT' }) => {
  const container = useRef();
  const [widgetId] = useState(`tradingview_${Math.random().toString(36).substring(7)}`);

  useEffect(() => {
    let tvWidget = null;
    
    const initWidget = () => {
      if (typeof TradingView !== 'undefined' && container.current) {
        tvWidget = new TradingView.widget({
          "autosize": true,
          "symbol": symbol,
          "interval": "60",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#f1f3f6",
          "enable_publishing": false,
          "allow_symbol_change": true,
          "container_id": widgetId,
          "hide_side_toolbar": false,
          "save_image": false,
          "backgroundColor": "rgba(0, 0, 0, 1)",
          "gridColor": "rgba(42, 46, 57, 0.06)",
          "details": true,
          "hotlist": true,
          "calendar": true,
          "show_popup_button": true,
          "popup_width": "1000",
          "popup_height": "650",
          "width": "100%",
          "height": "100%"
        });
      }
    };

    // Check if script already exists
    if (!document.getElementById('tradingview-widget-script')) {
      const script = document.createElement("script");
      script.id = 'tradingview-widget-script';
      script.src = "https://s3.tradingview.com/tv.js";
      script.type = "text/javascript";
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      initWidget();
    }

    return () => {
      // Clean up widget if possible (TradingView doesn't have a formal destroy, 
      // but clearing the container helps)
      if (container.current) {
        container.current.innerHTML = '';
      }
    };
  }, [symbol, widgetId]);

  return (
    <div 
      id={widgetId} 
      ref={container} 
      style={{ 
        height: "100%", 
        width: "100%",
        display: "block",
        position: "absolute",
        top: 0,
        left: 0
      }} 
    />
  );
};

export default TradingViewWidget;