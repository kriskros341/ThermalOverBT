let isConnected = false;

export function getConnected() {
  return isConnected;
}

export function setConnected(status: boolean) {
  isConnected = status;
}
