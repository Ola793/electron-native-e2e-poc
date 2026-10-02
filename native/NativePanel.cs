// The native half of the Hybrid Demo app: a WinForms window that talks to Electron
// over stdin/stdout (one JSON object per line).
//
// Written against C# 5 on purpose: it compiles with the csc.exe that ships with
// .NET Framework 4.x on every Windows machine, so no SDK is needed (see build.ps1).
//
//   NativePanel.exe                      standalone top-level window
//   NativePanel.exe --ipc                top-level window driven by Electron
//   NativePanel.exe --ipc --parent-hwnd=<hwnd> --bounds=x,y,w,h
//                                        child window embedded in the Electron window

using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace HybridDemo
{
    internal sealed class PanelForm : Form
    {
        private const int GWL_STYLE = -16;
        private const int GWL_EXSTYLE = -20;
        private const long WS_CLIPSIBLINGS = 0x04000000L;
        private const long WS_EX_LAYERED = 0x00080000L;
        private const uint LWA_ALPHA = 0x0002;
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_SHOWWINDOW = 0x0040;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetParent(IntPtr child, IntPtr newParent);

        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
        private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);

        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
        private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);

        [DllImport("user32.dll")]
        private static extern bool SetLayeredWindowAttributes(IntPtr window, uint colorKey, byte alpha, uint flags);

        [DllImport("user32.dll")]
        private static extern bool ScreenToClient(IntPtr window, ref Point point);

        [DllImport("user32.dll")]
        private static extern bool MoveWindow(IntPtr window, int x, int y, int width, int height, bool repaint);

        [DllImport("user32.dll")]
        private static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);

        private readonly TextBox messageInput = new TextBox();
        private readonly Button sendButton = new Button();
        private readonly CheckBox urgentCheckBox = new CheckBox();
        private readonly ComboBox priorityCombo = new ComboBox();
        private readonly Label receivedLabel = new Label();
        private readonly Label statusLabel = new Label();
        private readonly Button closeButton = new Button();

        private readonly IntPtr parentHwnd;
        private readonly Rectangle dockBounds;
        private readonly TextWriter output;

        public PanelForm(IntPtr parentHwnd, Rectangle dockBounds, TextWriter output)
        {
            this.parentHwnd = parentHwnd;
            this.dockBounds = dockBounds;
            this.output = output;
            BuildLayout();
        }

        private bool Docked
        {
            get { return parentHwnd != IntPtr.Zero; }
        }

        // Control.Name is what UI Automation reports as AutomationId, so every control gets a stable one.
        private void BuildLayout()
        {
            // Layout stays suspended until every control is added, so the DPI auto-scaling covers all of them.
            SuspendLayout();
            Name = "nativePanel";
            Text = "Native Panel";
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(420, 190);
            MaximizeBox = false;
            if (Docked)
            {
                // A non-top-level form is created as a WS_CHILD window, which is what SetParent needs.
                TopLevel = false;
                FormBorderStyle = FormBorderStyle.None;
            }
            else
            {
                FormBorderStyle = FormBorderStyle.FixedSingle;
                StartPosition = FormStartPosition.CenterScreen;
            }

            Label messageLabel = new Label();
            messageLabel.Name = "messageLabel";
            messageLabel.Text = "Message for Electron:";
            messageLabel.SetBounds(12, 14, 130, 20);

            messageInput.Name = "messageInput";
            messageInput.AccessibleName = "Message for Electron";
            messageInput.SetBounds(146, 11, 262, 23);

            urgentCheckBox.Name = "urgentCheckBox";
            urgentCheckBox.Text = "Mark as urgent";
            urgentCheckBox.SetBounds(146, 42, 130, 22);

            Label priorityLabel = new Label();
            priorityLabel.Name = "priorityLabel";
            priorityLabel.Text = "Priority:";
            priorityLabel.SetBounds(12, 74, 130, 20);

            priorityCombo.Name = "priorityCombo";
            priorityCombo.AccessibleName = "Priority";
            priorityCombo.DropDownStyle = ComboBoxStyle.DropDownList;
            priorityCombo.Items.AddRange(new object[] { "Low", "Normal", "High" });
            priorityCombo.SelectedItem = "Normal";
            priorityCombo.SetBounds(146, 71, 120, 23);

            sendButton.Name = "sendButton";
            sendButton.Text = "Send to Electron";
            sendButton.SetBounds(146, 104, 130, 28);
            sendButton.Click += delegate { SendMessage(); };

            closeButton.Name = "closeButton";
            closeButton.Text = "Close";
            closeButton.SetBounds(284, 104, 80, 28);
            closeButton.Click += delegate { Close(); };

            receivedLabel.Name = "receivedLabel";
            receivedLabel.Text = "Received: (nothing yet)";
            receivedLabel.SetBounds(12, 142, 396, 20);

            statusLabel.Name = "statusLabel";
            statusLabel.Text = "Sent: (nothing yet)";
            statusLabel.SetBounds(12, 164, 396, 20);

            AcceptButton = sendButton;
            Controls.AddRange(new Control[]
            {
                messageLabel, messageInput, urgentCheckBox, priorityLabel, priorityCombo,
                sendButton, closeButton, receivedLabel, statusLabel
            });
            ResumeLayout(false);
            PerformLayout();
        }

        // Re-parents the form into the Electron window: from here on it is a child HWND of another process.
        public void DockIntoParent()
        {
            if (!Docked) return;
            SetParent(Handle, parentHwnd);

            // Chromium composes its window without a GDI redirection surface, so a plain child HWND
            // is never painted there. A layered child window gets a surface of its own.
            long style = GetWindowLongPtr(Handle, GWL_STYLE).ToInt64() | WS_CLIPSIBLINGS;
            SetWindowLongPtr(Handle, GWL_STYLE, new IntPtr(style));
            long exStyle = GetWindowLongPtr(Handle, GWL_EXSTYLE).ToInt64() | WS_EX_LAYERED;
            SetWindowLongPtr(Handle, GWL_EXSTYLE, new IntPtr(exStyle));
            SetLayeredWindowAttributes(Handle, 0, 255, LWA_ALPHA);

            ApplyDockBounds(dockBounds);
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            Emit(new Dictionary<string, object> { { "type", "ready" }, { "hwnd", Handle.ToInt64() } });
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            Emit(new Dictionary<string, object> { { "type", "closed" } });
            base.OnFormClosed(e);
        }

        // Bounds arrive in physical screen pixels; a child window is positioned in its parent's client area.
        public void ApplyDockBounds(Rectangle bounds)
        {
            if (!Docked) return;
            Point origin = bounds.Location;
            ScreenToClient(parentHwnd, ref origin);
            MoveWindow(Handle, origin.X, origin.Y, bounds.Width, bounds.Height, true);
            // Chromium keeps its own child windows in the client area; stay above them.
            SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        }

        public void ShowReceived(string text)
        {
            receivedLabel.Text = "Received: " + text;
        }

        private void SendMessage()
        {
            string text = messageInput.Text;
            string priority = (string)priorityCombo.SelectedItem;
            bool urgent = urgentCheckBox.Checked;

            statusLabel.Text = "Sent: " + text + " (" + priority + (urgent ? ", urgent" : "") + ")";
            Emit(new Dictionary<string, object>
            {
                { "type", "message" }, { "text", text }, { "urgent", urgent }, { "priority", priority }
            });
        }

        private void Emit(Dictionary<string, object> payload)
        {
            if (output == null) return;
            try
            {
                output.WriteLine(new JavaScriptSerializer().Serialize(payload));
            }
            catch (IOException)
            {
                // Electron is gone; the stdin reader closes the form.
            }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            bool ipc = false;
            IntPtr parentHwnd = IntPtr.Zero;
            Rectangle bounds = new Rectangle(0, 0, 420, 190);

            foreach (string arg in args)
            {
                if (arg == "--ipc") ipc = true;
                if (arg.StartsWith("--parent-hwnd=")) parentHwnd = new IntPtr(long.Parse(arg.Substring("--parent-hwnd=".Length)));
                if (arg.StartsWith("--bounds=")) bounds = ParseBounds(arg.Substring("--bounds=".Length));
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            TextWriter output = null;
            if (ipc)
            {
                StreamWriter writer = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
                writer.AutoFlush = true;
                output = writer;
            }

            PanelForm form = new PanelForm(parentHwnd, bounds, output);
            // Commands are posted to the form's window, so its handle has to exist before the first one arrives.
            IntPtr handle = form.Handle;
            form.DockIntoParent();
            if (ipc) StartCommandReader(form);
            Application.Run(form);
        }

        private static Rectangle ParseBounds(string value)
        {
            string[] parts = value.Split(',');
            return new Rectangle(int.Parse(parts[0]), int.Parse(parts[1]), int.Parse(parts[2]), int.Parse(parts[3]));
        }

        // Commands arrive on stdin. End of stream means Electron exited, so the panel closes with it
        // instead of lingering as an orphan process.
        private static void StartCommandReader(PanelForm form)
        {
            Thread thread = new Thread(delegate()
            {
                StreamReader reader = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
                JavaScriptSerializer json = new JavaScriptSerializer();
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    Dictionary<string, object> command;
                    try
                    {
                        command = json.Deserialize<Dictionary<string, object>>(line);
                    }
                    catch (ArgumentException)
                    {
                        continue;
                    }
                    if (command == null || !command.ContainsKey("type")) continue;
                    Dispatch(form, command);
                }
                Dispatch(form, new Dictionary<string, object> { { "type", "close" } });
            });
            thread.IsBackground = true;
            thread.Start();
        }

        private static void Dispatch(PanelForm form, Dictionary<string, object> command)
        {
            if (form.IsDisposed) return;
            try
            {
                form.BeginInvoke(new MethodInvoker(delegate { Handle(form, command); }));
            }
            catch (InvalidOperationException)
            {
                // The form closed between the check and the call.
            }
        }

        private static void Handle(PanelForm form, Dictionary<string, object> command)
        {
            switch ((string)command["type"])
            {
                case "show-message":
                    form.ShowReceived(Convert.ToString(command["text"]));
                    break;
                case "bounds":
                    form.ApplyDockBounds(new Rectangle(
                        Convert.ToInt32(command["x"]), Convert.ToInt32(command["y"]),
                        Convert.ToInt32(command["width"]), Convert.ToInt32(command["height"])));
                    break;
                case "close":
                    form.Close();
                    break;
            }
        }
    }
}
