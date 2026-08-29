#include <QApplication>
#include <QPlainTextEdit>
int main(int argc,char**argv){
    QApplication app(argc,argv);
    QPlainTextEdit editor;
    editor.setWindowTitle("ZZX++");
    editor.resize(960,700);
    editor.show();
    return app.exec();
}
