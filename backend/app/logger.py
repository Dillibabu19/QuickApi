import logging
import sys

def get_logger(name: str) -> logging.Logger:
    """
    Configures a logger with both console and file output.
    All application events and security warnings are logged through this.
    """
    logger = logging.getLogger(name)
    
    # Ensure handlers are only added once
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        
        # Standard format for logs including timestamp, level, and message
        formatter = logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        
        # Output logs to standard output (terminal)
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        
        # Persist logs to app.log for auditing and debugging
        file_handler = logging.FileHandler("app.log", encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        
    return logger

# Global logger instance used across the backend
logger = get_logger("quickapi")
