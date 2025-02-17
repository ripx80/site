{
  description = "ripx80 theme";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
  };
  outputs =
    { self
    , nixpkgs
    }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      formatter.${system} = pkgs.nixpkgs-fmt;
      devShells.${system}.default = pkgs.mkShell {
        nativeBuildInputs = [ pkgs.hugo ];
      };
    };
}
