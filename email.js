export async function sendStyledEmail(apiKey, to, subject, bodyContent) {
    const htmlTemplate = `
        <div dir="rtl" style="font-family: Arial, sans-serif; background-color: #f4f4f9; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h1 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">פורום SMTI</h1>
                <div style="font-size: 16px; color: #333; line-height: 1.6; margin-top: 20px;">
                    ${bodyContent}
                </div>
                <div style="margin-top: 30px; font-size: 12px; color: #888; text-align: center;">
                    <p>הודעה זו נשלחה באופן אוטומטי ממערכת הפורום.</p>
                </div>
            </div>
        </div>
    `;

    return await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'Forum SMTI <forum@smti.uk>',
            to: to,
            subject: subject,
            html: htmlTemplate
        })
    });
}
