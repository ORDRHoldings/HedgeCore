import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface TerminalState {
  open: boolean;
  logs: string[];
}

const initialState: TerminalState = {
  open: false,
  logs: [],
};

const terminalSlice = createSlice({
  name: "terminal",
  initialState,
  reducers: {
    setTerminalOpen(state, action: PayloadAction<boolean>) {
      state.open = action.payload;
    },
    appendLog(state, action: PayloadAction<string>) {
      state.logs.push(action.payload);
    },
    clearLogs(state) {
      state.logs = [];
    },
  },
});

export const { setTerminalOpen, appendLog, clearLogs } = terminalSlice.actions;
export default terminalSlice.reducer;
