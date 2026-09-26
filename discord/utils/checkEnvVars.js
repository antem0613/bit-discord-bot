function checkEnvVars(requirements) {
  const missingVars = requirements.filter(varName => !(varName in process.env));
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

export { checkEnvVars };