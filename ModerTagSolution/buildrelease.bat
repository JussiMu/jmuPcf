msbuild /t:restore
msbuild /p:configuration=Release
robocopy ./bin/Release/ ../SolutionPackages
