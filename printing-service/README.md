Printer service

first build the image

> docker build --no-cache -t printing-service .


then run the printer

> docker run --rm -it --network host -e PRINTER_MAC=DC:0D:30:C1:01:35 printing-service:latest

--network host is neccessary unless we do something much more stupid like --privileged.