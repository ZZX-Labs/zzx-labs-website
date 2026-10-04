package io.zzxlabs.zzxblogpost
import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.*

class MainActivity : Activity() {
    private lateinit var titleField: EditText
    private lateinit var bodyField: EditText
    private val prefs by lazy { getSharedPreferences("zzxblogpost", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24,24,24,24)
            setBackgroundColor(Color.rgb(18,18,18))
        }
        titleField = EditText(this).apply { hint="Title"; setTextColor(Color.WHITE); setHintTextColor(Color.GRAY) }
        bodyField = EditText(this).apply { hint="Markdown"; minLines=14; gravity=android.view.Gravity.TOP; setTextColor(Color.WHITE); setHintTextColor(Color.GRAY) }
        val save = Button(this).apply { text="SAVE OFFLINE"; setOnClickListener { saveDraft() } }
        val share = Button(this).apply { text="CONTROLLED EXPORT"; setOnClickListener { exportDraft() } }
        root.addView(titleField); root.addView(bodyField, LinearLayout.LayoutParams(-1,0,1f)); root.addView(save); root.addView(share)
        setContentView(root)
        titleField.setText(prefs.getString("title",""))
        bodyField.setText(prefs.getString("body",""))
    }

    private fun saveDraft() {
        prefs.edit().putString("title",titleField.text.toString()).putString("body",bodyField.text.toString()).apply()
        Toast.makeText(this,"Saved offline",Toast.LENGTH_SHORT).show()
    }
    private fun exportDraft() {
        val text = """{"schema":"zzx.blogpost.mobile.v1","title":${json(titleField.text.toString())},"bodyMarkdown":${json(bodyField.text.toString())}}"""
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type="application/json"; putExtra(Intent.EXTRA_TEXT,text) }, "Export draft"))
    }
    private fun json(s:String)= "\"" + s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n") + "\""
}
