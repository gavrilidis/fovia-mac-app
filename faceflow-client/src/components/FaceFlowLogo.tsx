import React from "react";
import logoSrc from "../assets/FF-logo.png";

interface FaceFlowLogoProps {
  className?: string;
  size?: number;
}

export const FaceFlowLogo: React.FC<FaceFlowLogoProps> = ({ className, size = 64 }) => {
  return (
    <img
      src={logoSrc}
      alt="FaceFlow"
      className={className}
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
    />
  );
};
